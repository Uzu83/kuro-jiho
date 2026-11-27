"use client";

import { track } from "@vercel/analytics";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { articleViewEvent, eventFromArticleClick, isPublicAnalyticsPayload } from "@/lib/analytics/events";

function send(name: string, props: Record<string, string>) {
  if (!isPublicAnalyticsPayload(props)) {
    return;
  }
  try {
    track(name, props);
  } catch {
    // 計測の失敗で、記事を開く操作やリンクの遷移は止めない。
  }
}

export function ArticleAnalytics({
  theme,
  slot,
  slug,
  children,
}: {
  theme: string;
  slot: string;
  slug: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const event = articleViewEvent(theme, slot);
    if (event) {
      send(event.name, event.props);
    }
  }, [theme, slot, slug]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const node = event.target;
    if (!(node instanceof Element)) {
      return;
    }
    const link = node.closest("a");
    if (!link) {
      return;
    }
    const tracked = eventFromArticleClick({
      theme,
      marker: link.getAttribute("data-analytics"),
      href: link.getAttribute("href"),
    });
    if (tracked) {
      send(tracked.name, tracked.props);
    }
  }

  return (
    <div style={{ display: "contents" }} onClick={onClick}>
      {children}
    </div>
  );
}
