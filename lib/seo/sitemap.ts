import type { MetadataRoute } from "next";
import { LISTING_THEMES } from "@/lib/listings/model";
import { articleUrl, type FeedArticle } from "@/lib/seo/feed";
import { formatJstTimestamp } from "@/lib/seo/time";

/** フィードとサイトマップに出してよい静的パス。管理画面と API は入れない。 */
export const SITEMAP_PATHS = ["/", "/about", "/policy", "/corrections", ...LISTING_THEMES.map((theme) => `/${theme}`)] as const;

export function sitemapEntries(origin: string, articles: readonly FeedArticle[]): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  const add = (url: string, lastModified?: string) => {
    if (seen.has(url) || url.includes("?") || url.includes("/admin") || url.includes("/api")) {
      return;
    }
    seen.add(url);
    entries.push(lastModified ? { url, lastModified } : { url });
  };

  for (const path of SITEMAP_PATHS) {
    add(`${origin}${path}`);
  }

  const dates = [...new Set(articles.map((article) => article.date))].sort();
  for (const date of dates) {
    add(`${origin}/archive/${date}`);
  }

  for (const article of articles) {
    add(articleUrl(origin, article.slug), formatJstTimestamp(article.updatedAt) ?? undefined);
  }

  return entries;
}

export function robotsDocument(origin: string): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
