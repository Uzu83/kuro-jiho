"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_NEXT_COOKIE, performMagicLinkRequest } from "@/lib/admin/login";
import { authorizeAdminAction, isTrustedMutationOrigin, mutationHost } from "@/lib/admin/gate";
import { parseArticleForm } from "@/lib/admin/form";
import { loadEditable } from "@/lib/admin/queries";
import { lookupAllowlisted, readAdminSession, signOutAdmin } from "@/lib/admin/session";
import { createAdminStore } from "@/lib/admin/store";
import {
  CSRF_MESSAGE,
  EMPTY_FORM_STATE,
  handleAdminSubmission,
  type ArticleFormState,
} from "@/lib/admin/submit";
import { revalidateArticleSurfaces } from "@/lib/kuro/revalidate";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createClient } from "@/lib/supabase/server";

function callbackUrl(headerList: Headers): string | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      const url = new URL(site);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null;
      }
      if (url.username !== "" || url.password !== "") {
        return null;
      }
      return `${url.origin}/auth/callback`;
    } catch {
      return null;
    }
  }

  const host = mutationHost(headerList);
  if (!host) {
    return null;
  }
  const proto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  if (proto !== "http" && proto !== "https") {
    return null;
  }
  return `${proto}://${host}/auth/callback`;
}

async function rememberNext(next: string) {
  const jar = await cookies();
  jar.set(ADMIN_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function requestMagicLink(
  _previous: { message: string; tone: "ok" | "error" },
  formData: FormData,
): Promise<{ message: string; tone: "ok" | "error" }> {
  const headerList = await headers();
  const email = typeof formData.get("email") === "string" ? formData.get("email") as string : "";
  const next = typeof formData.get("next") === "string" ? formData.get("next") as string : null;

  const result = await performMagicLinkRequest({
    origin: headerList.get("origin"),
    host: mutationHost(headerList),
    email,
    next,
    redirectTo: hasPublicSupabaseEnv() ? callbackUrl(headerList) : null,
    lookup: lookupAllowlisted,
    send: async (address) => {
      const redirectTo = callbackUrl(headerList);
      if (!redirectTo) {
        throw new Error("redirect missing");
      }
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        throw new Error("otp failed");
      }
    },
  });

  if (result.status === "forbidden") {
    return { tone: "error", message: CSRF_MESSAGE };
  }
  if (result.status === "invalid") {
    return { tone: "error", message: "メールアドレスの形式を確認してください。" };
  }
  if (result.status === "config") {
    return { tone: "error", message: "ログインの準備ができていません。環境変数を確認してください。" };
  }

  await rememberNext(result.next);
  return {
    tone: "ok",
    message: "メールの送信を受け付けました。届いたリンクを開いてください。届かないときは、時間をおいて再度お試しください。",
  };
}

export async function signOutAction(): Promise<void> {
  const headerList = await headers();
  if (!isTrustedMutationOrigin(headerList.get("origin"), mutationHost(headerList))) {
    return;
  }
  await signOutAdmin();
  redirect("/admin/login");
}

export async function submitArticle(
  _previous: ArticleFormState,
  formData: FormData,
): Promise<ArticleFormState> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const host = mutationHost(headerList);
  if (!isTrustedMutationOrigin(origin, host)) {
    return { ...EMPTY_FORM_STATE, errors: [CSRF_MESSAGE] };
  }

  const session = await readAdminSession();
  const gate = authorizeAdminAction(session);
  if (gate === "login") {
    redirect("/admin/login");
  }
  if (gate === "deny") {
    await signOutAdmin();
    redirect("/admin/login?error=denied");
  }

  const form = parseArticleForm(formData);
  const mode = formData.get("mode") === "edit" ? "edit" : "create";
  const currentSlug =
    typeof formData.get("current_slug") === "string" ? formData.get("current_slug") as string : "";
  const current = mode === "edit" ? await loadEditable(currentSlug) : null;

  const result = await handleAdminSubmission({
    origin,
    host,
    gate,
    mode,
    current,
    form,
    now: new Date(),
    store: createAdminStore(),
    revalidate: revalidateArticleSurfaces,
  });

  if (result.kind === "csrf") {
    return { ...EMPTY_FORM_STATE, errors: [CSRF_MESSAGE] };
  }
  if (result.kind === "login") {
    redirect("/admin/login");
  }
  if (result.kind === "deny") {
    await signOutAdmin();
    redirect("/admin/login?error=denied");
  }
  if (result.kind === "saved") {
    redirect(`/admin/articles/${result.slug}?saved=1`);
  }

  return result.state;
}
