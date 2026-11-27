import { ARTICLE_THEMES } from "@/lib/article-schema";
import { absolutePublicUrl, siteOrigin } from "@/lib/seo/public-url";
import type { FeedEntry } from "@/lib/seo/feed";

export function sitemapUrls(entries: readonly FeedEntry[], origin = siteOrigin()): string[] {
  const paths = ["/", ...ARTICLE_THEMES.map((theme) => `/${theme}`)];
  for (const entry of entries) {
    paths.push(`/articles/${entry.slug}`);
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const url = absolutePublicUrl(origin, path);
    if (!url || seen.has(url) || url.includes("?")) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function robotsDisallow(): string[] {
  return ["/admin", "/api"];
}
