import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
export type AdminSession =
  | { configured: false }
  | { configured: true; authenticated: false }
  | { configured: true; authenticated: true; allowlisted: false; userId: string }
  | { configured: true; authenticated: true; allowlisted: true; userId: string };

/**
 * 許可リストを数える。行の中身は返さない。
 * サービスロールが読めないときは例外にし、ログイン処理側で準備不足にする。
 */
export async function lookupAllowlisted(email: string): Promise<boolean> {
  const service = createServiceClient();
  const { count, error } = await service
    .from("admin_allowlist")
    .select("*", { count: "exact", head: true })
    .eq("email", email);

  if (error) {
    throw new Error("allowlist lookup failed");
  }

  return count === 1;
}

export const readAdminSession = cache(async (): Promise<AdminSession> => {
  if (!hasPublicSupabaseEnv()) {
    return { configured: false };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (error || !userId) {
      return { configured: true, authenticated: false };
    }

    const allowed = await supabase.rpc("admin_session_allowed");
    if (allowed.error || allowed.data !== true) {
      return { configured: true, authenticated: true, allowlisted: false, userId };
    }

    return { configured: true, authenticated: true, allowlisted: true, userId };
  } catch {
    return { configured: false };
  }
});

export async function signOutAdmin(): Promise<void> {
  if (!hasPublicSupabaseEnv()) {
    return;
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // セッションを消せなくても、画面には戻さない。
  }
}

/** レイアウトと各管理ページから呼ぶ。未ログインはログインへ、許可外は拒否へ。 */
export async function requireAdmin(): Promise<void> {
  const session = await readAdminSession();
  if (!session.configured || !session.authenticated) {
    redirect("/admin/login");
  }
  if (!session.allowlisted) {
    redirect("/auth/rejected");
  }
}
