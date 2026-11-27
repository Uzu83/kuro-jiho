import { ARTICLE_SLUG_PATTERN, type ArticleTheme } from "@/lib/article-schema";
import { themeLabel } from "@/lib/articles/public";
import { isIsoDate } from "@/lib/kuro/dates";
import { isArticleTheme } from "@/lib/listings/model";
import { formatRfc822Jst } from "@/lib/seo/time";

export type FeedArticle = {
  slug: string;
  title: string;
  theme: ArticleTheme;
  date: string;
  publishedAt: string;
  updatedAt: string;
  summary: [string, string, string];
};

export type FeedArticleRow = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  summary: string[];
};

const SITE_DESCRIPTION =
  "AI記者「クロ」が、公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。";

function cleanLine(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/** 公開済みだけ。下書き、非公開、形の違う行は null。 */
export function toFeedArticle(row: FeedArticleRow): FeedArticle | null {
  if (row.status !== "published" || !row.published_at) {
    return null;
  }
  if (!ARTICLE_SLUG_PATTERN.test(row.slug) || !isArticleTheme(row.theme) || !isIsoDate(row.date)) {
    return null;
  }

  const title = cleanLine(row.title);
  if (!title || !Array.isArray(row.summary) || row.summary.length !== 3) {
    return null;
  }
  const summary = row.summary.map((item) => cleanLine(item));
  if (summary.some((item) => item === null)) {
    return null;
  }
  if (Number.isNaN(Date.parse(row.published_at)) || Number.isNaN(Date.parse(row.updated_at))) {
    return null;
  }

  return {
    slug: row.slug,
    title,
    theme: row.theme,
    date: row.date,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    summary: summary as [string, string, string],
  };
}

export function publishedFeedArticles(rows: readonly FeedArticleRow[], theme: ArticleTheme | null = null): FeedArticle[] {
  const articles: FeedArticle[] = [];
  for (const row of rows) {
    const article = toFeedArticle(row);
    if (!article || (theme !== null && article.theme !== theme)) {
      continue;
    }
    articles.push(article);
  }
  return articles.sort(byNewest);
}

function byNewest(a: FeedArticle, b: FeedArticle): number {
  const left = Date.parse(a.publishedAt);
  const right = Date.parse(b.publishedAt);
  if (left !== right) {
    return right - left;
  }
  if (a.slug === b.slug) {
    return 0;
  }
  return a.slug < b.slug ? 1 : -1;
}

export function escapeXml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function articleUrl(origin: string, slug: string): string {
  return `${origin}/articles/${slug}`;
}

export function parseFeedTheme(value: string): ArticleTheme | null {
  const theme = value.endsWith(".xml") ? value.slice(0, -".xml".length) : value;
  return isArticleTheme(theme) ? theme : null;
}

export function feedSelfPath(theme: ArticleTheme | null): string {
  return theme ? `/feed/${theme}.xml` : "/feed.xml";
}

export function feedTitle(theme: ArticleTheme | null): string {
  return theme ? `クロの時報（${themeLabel(theme)}）` : "クロの時報";
}

export function feedDescription(theme: ArticleTheme | null): string {
  if (!theme) {
    return SITE_DESCRIPTION;
  }
  return `${themeLabel(theme)}の公開記事です。各項目は3行の要約と、記事へのリンクです。`;
}

/**
 * RSS 2.0。項目は要約と記事URLまでで、本文は入れない。
 * リンクは絶対URLで、クエリは付けない。
 */
export function buildFeedXml(input: {
  origin: string;
  theme: ArticleTheme | null;
  articles: readonly FeedArticle[];
  now: Date;
}): string {
  const self = `${input.origin}${feedSelfPath(input.theme)}`;
  const channelLink = input.theme ? `${input.origin}/${input.theme}` : `${input.origin}/`;
  const lastBuild = formatRfc822Jst(input.now.toISOString());
  const items = input.articles
    .map((article) => {
      const link = articleUrl(input.origin, article.slug);
      const pubDate = formatRfc822Jst(article.publishedAt);
      if (!pubDate) {
        return "";
      }
      const description = [...article.summary, link].join("\n");
      return [
        "    <item>",
        `      <title>${escapeXml(article.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `      <category>${escapeXml(themeLabel(article.theme))}</category>`,
        `      <description>${escapeXml(description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .filter((item) => item.length > 0)
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${escapeXml(feedTitle(input.theme))}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(feedDescription(input.theme))}</description>`,
    `    <language>ja</language>`,
    lastBuild ? `    <lastBuildDate>${escapeXml(lastBuild)}</lastBuildDate>` : "",
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>`,
    items,
    `  </channel>`,
    `</rss>`,
    "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
