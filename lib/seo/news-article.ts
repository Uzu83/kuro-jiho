import type { PublicArticle } from "@/lib/articles/public";
import { formatJstOffset } from "@/lib/seo/dates";
import { absolutePublicUrl, siteOrigin } from "@/lib/seo/public-url";

export const NEWS_AUTHOR = "クロ（AI記者）";

export function newsArticleData(article: PublicArticle, origin = siteOrigin()): Record<string, unknown> | null {
  const pageUrl = absolutePublicUrl(origin, `/articles/${article.slug}`);
  const datePublished = formatJstOffset(article.publishedAt);
  const dateModified = formatJstOffset(article.updatedAt);
  if (!pageUrl || !datePublished || !dateModified) {
    return null;
  }

  const isBasedOn = article.sources.flatMap((source) => (source.url ? [source.url] : []));

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    datePublished,
    dateModified,
    inLanguage: "ja",
    description: article.summary.join("\n"),
    mainEntityOfPage: pageUrl,
    author: {
      "@type": "Organization",
      name: NEWS_AUTHOR,
    },
    isBasedOn,
  };
}

/** script 本文に生の < を残さない。 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
