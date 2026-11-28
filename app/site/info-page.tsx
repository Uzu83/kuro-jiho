import type { ReactNode } from "react";
import { SiteFooter } from "@/app/site/footer";
import { SiteHeader } from "@/app/site/header";

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
      <SiteHeader withNav={false} />
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {children}
      <SiteFooter current={current} />
    </main>
  );
}
