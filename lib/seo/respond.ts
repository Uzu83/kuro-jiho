import "server-only";

import type { ArticleTheme } from "@/lib/article-schema";
import { buildFeedXml } from "@/lib/seo/feed";
import { loadPublishedFeed } from "@/lib/seo/load";
import { resolveSiteOrigin } from "@/lib/site/origin";

export function feedXmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export function feedTextResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function renderPublishedFeed(theme: ArticleTheme | null, request: Request): Promise<Response> {
  const requestOrigin = new URL(request.url).origin;
  const origin = resolveSiteOrigin(requestOrigin);
  const articles = await loadPublishedFeed(theme);
  return feedXmlResponse(buildFeedXml({ origin, theme, articles, now: new Date() }));
}
