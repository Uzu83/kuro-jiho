import { ARTICLE_SLUG_PATTERN, type ArticleTheme } from "@/lib/article-schema";
import { themeLabel } from "@/lib/articles/public";
import { formatRfc822Jst } from "@/lib/seo/dates";
import { absolutePublicUrl, isArticleTheme, siteOrigin } from "@/lib/seo/public-url";

const SITE_TITLE = "クロの時報";
const SITE_DESCRIPTION =
  "AI記者「クロ」が、公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。";

export type FeedSource = {
  slug: string;
  title: string;
  theme: string;
  status: string;
  publishedAt: string | null;
  summary: readonly string[];
};

export type FeedEntry = {
  slug: string;
  title: string;
  theme: ArticleTheme;
  publishedAt: string;
  summary: string;
};

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function summaryText(lines: readonly string[]): string | null {
  const text = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return text.length > 0 ? text : null;
}

/** 公開済みだけ。下書き、非公開、不明なテーマ、クエリ付き URL は入れない。 */
export function selectFeedEntries(rows: readonly FeedSource[], theme?: ArticleTheme): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const row of rows) {
    if (row.status !== "published" || !row.publishedAt || !isArticleTheme(row.theme)) {
      continue;
    }
    if (theme && row.theme !== theme) {
      continue;
    }
    if (!ARTICLE_SLUG_PATTERN.test(row.slug)) {
      continue;
    }
    const title = row.title.trim();
    const summary = summaryText(row.summary);
    if (title.length === 0 || !summary || !formatRfc822Jst(row.publishedAt)) {
      continue;
    }
    entries.push({
      slug: row.slug,
      title,
      theme: row.theme,
      publishedAt: row.publishedAt,
      summary,
    });
  }
  return entries;
}

export function themeFromFeedFile(file: string): ArticleTheme | null {
  if (!file.endsWith(".xml") || file.includes("/") || file.slice(0, -4).includes(".")) {
    return null;
  }
  const theme = file.slice(0, -4);
  return isArticleTheme(theme) ? theme : null;
}

export function buildRss(input: {
  origin?: string;
  selfPath: string;
  theme?: ArticleTheme;
  entries: readonly FeedEntry[];
}): string | null {
  const origin = siteOrigin(input.origin ?? null);
  const selfUrl = absolutePublicUrl(origin, input.selfPath);
  const home = absolutePublicUrl(origin, "/");
  if (!selfUrl || !home) {
    return null;
  }

  const title = input.theme ? `${SITE_TITLE}（${themeLabel(input.theme)}）` : SITE_TITLE;
  const items: string[] = [];
  let newest: string | null = null;

  for (const entry of input.entries) {
    if (input.theme && entry.theme !== input.theme) {
      continue;
    }
    const link = absolutePublicUrl(origin, `/articles/${entry.slug}`);
    const pubDate = formatRfc822Jst(entry.publishedAt);
    if (!link || !pubDate || link.includes("?") || link.includes("#")) {
      continue;
    }
    if (!newest || Date.parse(entry.publishedAt) > Date.parse(newest)) {
      newest = entry.publishedAt;
    }
    items.push(`    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(entry.summary)}</description>
      <category>${escapeXml(themeLabel(entry.theme))}</category>
    </item>`);
  }

  const lastBuild = newest ? formatRfc822Jst(newest) : null;
  const lastBuildTag = lastBuild ? `    <lastBuildDate>${escapeXml(lastBuild)}</lastBuildDate>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(home)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>ja</language>
${lastBuildTag}    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>
`;
}
