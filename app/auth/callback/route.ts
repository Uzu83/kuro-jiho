import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeAdminNext } from "@/lib/admin/gate";
import { ADMIN_NEXT_COOKIE } from "@/lib/admin/login";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const jar = await cookies();
  const next = safeAdminNext(jar.get(ADMIN_NEXT_COOKIE)?.value);
  jar.set(ADMIN_NEXT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });

  if (!code && !tokenHash) {
    redirect("/admin/login?error=link");
  }

  const supabase = await createClient();
  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) {
      redirect("/admin/login?error=link");
    }
  } else if (type === "email" || type === "magiclink" || type === null) {
    const verified = await supabase.auth.verifyOtp({
      token_hash: tokenHash ?? "",
      type: type === "magiclink" ? "magiclink" : "email",
    });
    if (verified.error) {
      redirect("/admin/login?error=link");
    }
  } else {
    redirect("/admin/login?error=link");
  }

  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims.sub) {
    redirect("/admin/login?error=link");
  }

  const allowed = await supabase.rpc("admin_session_allowed");
  if (allowed.error || allowed.data !== true) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=denied");
  }

  redirect(next);
}
