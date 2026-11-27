"use client";

import { track } from "@vercel/analytics";
import { useEffect, type ReactNode } from "react";
import { articleViewProps, reportErrorProps, sourceClickProps, ARTICLE_VIEW, REPORT_ERROR_CLICK, SOURCE_CLICK } from "@/lib/seo/events";

export function ArticleViewBeacon({ theme, slot }: { theme: string; slot: string }) {
  useEffect(() => {
    const props = articleViewProps(theme, slot);
    if (props) {
      track(ARTICLE_VIEW, props);
    }
  }, [theme, slot]);

  return null;
}

export function SourceOutboundLink({
  href,
  theme,
  children,
}: {
  href: string;
  theme: string;
  children: ReactNode;
}) {
  return (
    <a
      className="article-source-url"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        const props = sourceClickProps(theme, href);
        if (props) {
          track(SOURCE_CLICK, props);
        }
      }}
    >
      {children}
    </a>
  );
}

export function ReportErrorLink({ href, theme }: { href: string; theme: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => {
      const props = reportErrorProps(theme);
      if (props) {
        track(REPORT_ERROR_CLICK, props);
      }
    }}>
      誤りを報告
      <span className="visually-hidden">（新しいタブで開く）</span>
    </a>
  );
}
