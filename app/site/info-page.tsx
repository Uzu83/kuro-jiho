import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/app/site/footer";

export function InfoPage({
  title,
  lead,
  current,
  children,
}: {
  title: string;
  lead: string;
  current: string;
  children: ReactNode;
}) {
  return (
    <main className="site-main">
      <header className="site-header">
        <p className="kicker">AI記者クロ</p>
        <p className="site-brand">
          <Link href="/">クロの時報</Link>
        </p>
      </header>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {children}
      <SiteFooter current={current} />
    </main>
  );
}
