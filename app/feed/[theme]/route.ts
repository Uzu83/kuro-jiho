import { buildRss, themeFromFeedFile } from "@/lib/seo/feed";
import { loadPublishedFeed } from "@/lib/seo/catalog";
import { siteOrigin } from "@/lib/seo/public-url";

export const revalidate = 3600;

export async function GET(_request: Request, context: { params: Promise<{ theme: string }> }) {
  const { theme: file } = await context.params;
  const theme = themeFromFeedFile(file);
  if (!theme) {
    return new Response("Not found", { status: 404 });
  }

  const origin = siteOrigin();
  const entries = await loadPublishedFeed(theme);
  const xml = buildRss({
    origin,
    selfPath: `/feed/${theme}.xml`,
    theme,
    entries,
  });
  if (!xml) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
