import { redirect } from "next/navigation";
import { readAdminSession, signOutAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

/** 許可リスト外のセッションを切る。許可済みの人はログアウトしない。 */
export async function GET() {
  const session = await readAdminSession();
  if (session.configured && session.authenticated && !session.allowlisted) {
    await signOutAdmin();
  }

  redirect("/admin/login?error=denied");
}
