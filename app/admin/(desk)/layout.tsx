import type { ReactNode } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <main className="admin-main">
      <header className="admin-header">
        <p className="kicker">管理</p>
        <p className="site-brand">
          <Link href="/admin">クロの時報</Link>
        </p>
        <nav className="admin-nav" aria-label="管理">
          <Link href="/admin">記事一覧</Link>
          <Link href="/admin/articles/new">新しい記事</Link>
          <form action={signOutAction}>
            <button type="submit">ログアウト</button>
          </form>
        </nav>
      </header>
      {children}
    </main>
  );
}
