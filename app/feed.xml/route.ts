import { buildRss } from "@/lib/seo/feed";
import { loadPublishedFeed } from "@/lib/seo/catalog";
import { siteOrigin } from "@/lib/seo/public-url";

export const revalidate = 3600;

export async function GET() {
  const origin = siteOrigin();
  const entries = await loadPublishedFeed();
  const xml = buildRss({ origin, selfPath: "/feed.xml", entries });
  if (!xml) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
