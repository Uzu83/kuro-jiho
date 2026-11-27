import { OG_IMAGE } from "@/lib/seo/og-mark";
import { articleUrl } from "@/lib/seo/feed";
import { formatJstTimestamp } from "@/lib/seo/time";

export const AI_AUTHOR_NAME = "クロ（AI記者）";

export type NewsArticleInput = {
  slug: string;
  title: string;
  summary: readonly string[];
  publishedAt: string;
  updatedAt: string;
  sources: readonly { url: string | null }[];
};

/** NewsArticle。日時は +09:00。出典は https のURLだけ。 */
export function newsArticleJsonLd(article: NewsArticleInput, origin: string): Record<string, unknown> | null {
  const datePublished = formatJstTimestamp(article.publishedAt);
  const dateModified = formatJstTimestamp(article.updatedAt);
  if (!datePublished || !dateModified || !datePublished.endsWith("+09:00") || !dateModified.endsWith("+09:00")) {
    return null;
  }

  const pageUrl = articleUrl(origin, article.slug);
  const imageUrl = `${pageUrl}/opengraph-image`;
  const sources = [...new Set(article.sources.map((source) => source.url).filter((url): url is string => Boolean(url)))];
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.summary.join(" "),
    inLanguage: "ja",
    datePublished,
    dateModified,
    mainEntityOfPage: pageUrl,
    url: pageUrl,
    image: {
      "@type": "ImageObject",
      url: imageUrl,
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
    },
    author: {
      "@type": "Organization",
      name: AI_AUTHOR_NAME,
      url: `${origin}/about`,
    },
    publisher: {
      "@type": "Organization",
      name: "クロの時報",
      url: origin,
    },
  };
  if (sources.length > 0) {
    data.isBasedOn = sources;
  }
  return data;
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
