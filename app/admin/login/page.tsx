import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/admin/login-form";
import { safeAdminNext } from "@/lib/admin/gate";
import { readAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ログイン｜クロの時報",
  robots: { index: false, follow: false },
};

function noticeOf(error: string | undefined): string | null {
  if (error === "link") {
    return "リンクが無効か、期限が切れています。もう一度送ってください。";
  }
  if (error === "denied") {
    return "このアカウントでは管理画面を利用できません。";
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeAdminNext(params.next);
  const session = await readAdminSession();

  if (session.configured && session.authenticated && session.allowlisted) {
    redirect(next);
  }
  if (session.configured && session.authenticated && !session.allowlisted) {
    redirect("/auth/rejected");
  }

  return (
    <main className="admin-main">
      <p className="kicker">管理</p>
      <h1>ログイン</h1>
      <p className="lead">許可されたメールアドレスに、ログイン用のリンクを送ります。パスワードはありません。</p>
      {noticeOf(params.error) ? <p className="admin-alert">{noticeOf(params.error)}</p> : null}
      {!session.configured ? (
        <p className="admin-alert">ログインの準備ができていません。環境変数を確認してください。</p>
      ) : null}
      <LoginForm nextPath={next} />
    </main>
  );
}
