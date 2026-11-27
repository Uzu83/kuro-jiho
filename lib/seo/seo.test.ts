import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createFeedDirectory, FEED_COLUMNS } from "@/lib/seo/directory";
import {
  buildFeedXml,
  escapeXml,
  parseFeedTheme,
  publishedFeedArticles,
  toFeedArticle,
  type FeedArticleRow,
} from "@/lib/seo/feed";
import { AI_AUTHOR_NAME, newsArticleJsonLd, serializeJsonLd } from "@/lib/seo/news-article";
import { OG_AI_LABEL } from "@/lib/seo/og-mark";
import { ogCard } from "@/lib/seo/og";
import { robotsDocument, SITEMAP_PATHS, sitemapEntries } from "@/lib/seo/sitemap";
import { formatJstTimestamp, formatRfc822Jst } from "@/lib/seo/time";
import { resolveSiteOrigin, siteOrigin } from "@/lib/site/origin";

const root = path.resolve(import.meta.dirname, "../..");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const now = new Date("2026-12-05T03:00:00.000Z");

function row(overrides: Partial<FeedArticleRow> = {}): FeedArticleRow {
  return {
    slug: "2026-12-01-07-notice",
    title: "福岡市が告示を公開",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    status: "published",
    published_at: "2026-12-01T07:00:00+09:00",
    updated_at: "2026-12-02T09:30:00+09:00",
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    ...overrides,
  };
}

function assertWellFormed(xml: string) {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const body = xml.slice(xml.indexOf("?>") + 2);
  const stack: string[] = [];
  const tags = /<(\/?)([A-Za-z0-9:-]+)([^>]*)>/g;
  for (const match of body.matchAll(tags)) {
    const name = match[2] ?? "";
    const closing = match[1] === "/";
    const selfClosing = /\/\s*$/.test(match[3] ?? "");
    if (selfClosing && !closing) {
      continue;
    }
    if (closing) {
      expect(stack.pop()).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack).toEqual([]);
  expect(body.replace(/&(?:amp|lt|gt|quot|apos);/g, "")).not.toContain("&");
}

describe("japan time", () => {
  it("formats structured data and RSS dates in +09:00", () => {
    expect(formatJstTimestamp("2026-11-30T22:00:00.000Z")).toBe("2026-12-01T07:00:00+09:00");
    expect(formatJstTimestamp("2026-12-01T15:00:00.000Z")).toBe("2026-12-02T00:00:00+09:00");
    expect(formatJstTimestamp("not-a-date")).toBeNull();
    expect(formatRfc822Jst("2026-12-01T07:00:00+09:00")).toBe("Tue, 01 Dec 2026 07:00:00 +0900");
    expect(formatRfc822Jst("2026-12-01T15:00:00.000Z")).toBe("Wed, 02 Dec 2026 00:00:00 +0900");
  });
});

describe("feeds and sitemap", () => {
  it("keeps published articles and drops drafts, unpublished rows, and admin", () => {
    const rows = [
      row(),
      row({
        slug: "2026-12-01-12-draft",
        title: "下書きの見出し",
        status: "draft",
        slot: "12",
        summary: ["下書き要約", "非公開にしない", "出てはいけない"],
      }),
      row({
        slug: "2026-12-01-17-hidden",
        title: "非公開の見出し",
        status: "unpublished",
        slot: "17",
      }),
      row({
        slug: "2026-12-03-20-sports",
        title: "試合の結果",
        theme: "sports",
        slot: "20",
        date: "2026-12-03",
        published_at: "2026-12-03T20:00:00+09:00",
        summary: ["試合があった", "点数は出典のとおり", "写真は使わない"],
      }),
      row({ slug: "not-a-slug", title: "形が違う" }),
      row({ title: "   " }),
      row({ published_at: null }),
    ];

    const articles = publishedFeedArticles(rows);
    expect(articles.map((article) => article.slug)).toEqual(["2026-12-03-20-sports", "2026-12-01-07-notice"]);
    expect(toFeedArticle(row({ status: "draft" }))).toBeNull();
    expect(toFeedArticle(row({ status: "unpublished" }))).toBeNull();

    const origin = "https://news.example";
    const xml = buildFeedXml({ origin, theme: null, articles, now });
    const sports = buildFeedXml({
      origin,
      theme: "sports",
      articles: publishedFeedArticles(rows, "sports"),
      now,
    });
    assertWellFormed(xml);
    assertWellFormed(sports);
    expect(xml).toContain("<title>クロの時報</title>");
    expect(xml).toContain('href="https://news.example/feed.xml"');
    expect(xml).toContain("https://news.example/articles/2026-12-01-07-notice");
    expect(xml).toContain("告示が出た");
    expect(xml).toContain("対象は市内");
    expect(xml).toContain("詳細は出典のとおり");
    expect(xml).not.toContain("下書き");
    expect(xml).not.toContain("非公開");
    expect(xml).not.toContain("/admin");
    const feedUrls = [...xml.matchAll(/https:\/\/news\.example[^<\s"]*/g)].map((match) => match[0]);
    expect(feedUrls.length).toBeGreaterThan(0);
    for (const url of feedUrls) {
      expect(url).not.toContain("?");
    }
    expect(xml).not.toMatch(EMAIL);
    expect(sports).toContain("<title>クロの時報（スポーツ）</title>");
    expect(sports).toContain("各項目は3行の要約と、記事へのリンクです。");
    expect(sports).toContain("https://news.example/articles/2026-12-03-20-sports");
    expect(sports).toContain("試合があった");
    expect(sports).not.toContain("告示が出た");
    expect(sports).not.toContain("下書き");
    expect(parseFeedTheme("sports.xml")).toBe("sports");
    expect(parseFeedTheme("sports")).toBe("sports");
    expect(parseFeedTheme("admin")).toBeNull();
    expect(parseFeedTheme("admin.xml")).toBeNull();

    const escaped = buildFeedXml({
      origin,
      theme: "fukuoka",
      articles: publishedFeedArticles([
        row({ title: "A & B <script>", summary: ["1 < 2", "引用&続き", "三行"] }),
      ]),
      now,
    });
    assertWellFormed(escaped);
    expect(escaped).toContain("A &amp; B &lt;script&gt;");
    expect(escaped).toContain("1 &lt; 2");
    expect(escapeXml("a&b")).toBe("a&amp;b");

    const urls = sitemapEntries(origin, articles).map((entry) => entry.url);
    expect(urls).toContain("https://news.example/");
    expect(urls).toContain("https://news.example/about");
    expect(urls).toContain("https://news.example/articles/2026-12-01-07-notice");
    expect(urls).toContain("https://news.example/archive/2026-12-01");
    expect(urls).toContain("https://news.example/archive/2026-12-03");
    expect(urls.join("\n")).not.toContain("/admin");
    expect(urls.join("\n")).not.toContain("/api");
    expect(urls.join("\n")).not.toContain("draft");
    expect(urls.join("\n")).not.toContain("hidden");
    expect(urls.join("\n")).not.toContain("?");
    expect(SITEMAP_PATHS).not.toContain("/admin");
    expect(SITEMAP_PATHS).not.toContain("/api");

    const robots = robotsDocument(origin);
    expect(robots.rules).toMatchObject({ allow: "/", disallow: ["/admin", "/api"] });
    expect(robots.sitemap).toBe("https://news.example/sitemap.xml");
    const modified = sitemapEntries(origin, articles).find(
      (entry) => entry.url === "https://news.example/articles/2026-12-01-07-notice",
    );
    expect(modified?.lastModified).toBe("2026-12-02T09:30:00+09:00");
  });

  it("pages published rows and does not return a partial feed when the end is unknown", async () => {
    const calls: { select: string; filters: string[]; range?: string }[] = [];
    const secret = "postgres://db.internal/secret-database";
    const pages = [
      [
        row({ status: "draft", title: "下書きの見出し" }),
        row({ title: "古い公開", published_at: "2026-12-01T07:00:00+09:00" }),
      ],
      [
        row({
          slug: "2026-12-04-12-later",
          title: "新しい公開",
          slot: "12",
          published_at: "2026-12-04T12:00:00+09:00",
          summary: ["新しい", "公開", "記事"],
        }),
        row({ status: "unpublished", title: "非公開の見出し", slug: "2026-12-04-17-hidden", slot: "17" }),
      ],
      [row({ slug: "2026-12-02-20-mid", title: "途中", slot: "20", published_at: "2026-12-02T20:00:00+09:00" })],
    ];
    let page = 0;
    const client = {
      from(table: string) {
        expect(table).toBe("articles");
        const call = { select: "", filters: [] as string[], range: undefined as string | undefined };
        calls.push(call);
        const api = {
          select(columns: string) {
            call.select = columns;
            return api;
          },
          eq(column: string, value: string) {
            call.filters.push(`${column}=${value}`);
            return api;
          },
          order() {
            return api;
          },
          range(from: number, to: number) {
            call.range = `${from}-${to}`;
            const data = pages[page] ?? [];
            page += 1;
            return Promise.resolve({ data, error: null });
          },
        };
        return api;
      },
    };

    const articles = await createFeedDirectory(client as never, { pageSize: 2, maxPages: 5 }).listPublished("fukuoka");
    expect(articles.map((article) => article.title)).toEqual(["新しい公開", "途中", "古い公開"]);
    expect(JSON.stringify(articles)).not.toContain("下書き");
    expect(JSON.stringify(articles)).not.toContain("非公開");
    expect(calls.every((call) => call.select === FEED_COLUMNS)).toBe(true);
    expect(FEED_COLUMNS).not.toContain("body_md");
    expect(FEED_COLUMNS).not.toContain("author");
    expect(FEED_COLUMNS).not.toContain("sources");
    expect(calls[0]).toMatchObject({ filters: ["status=published", "theme=fukuoka"], range: "0-1" });
    expect(calls[1]?.range).toBe("2-3");

    const failing = {
      from() {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          order() {
            return api;
          },
          range() {
            return Promise.resolve({ data: null, error: { message: secret } });
          },
        };
        return api;
      },
    };
    await expect(createFeedDirectory(failing as never).listPublished(null)).rejects.toThrow("記事の取得に失敗しました");
    try {
      await createFeedDirectory(failing as never).listPublished(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
    }

    const stuck = {
      from() {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          order() {
            return api;
          },
          range() {
            return Promise.resolve({ data: [row(), row()], error: null });
          },
        };
        return api;
      },
    };
    await expect(createFeedDirectory(stuck as never, { pageSize: 2, maxPages: 0 }).listPublished(null)).rejects.toThrow(
      "記事の取得に失敗しました",
    );
  });
});

describe("NewsArticle", () => {
  it("uses the organization author, source urls, and +09:00", () => {
    const data = newsArticleJsonLd(
      {
        slug: "2026-12-01-07-notice",
        title: "告示",
        summary: ["一行", "二行", "三行"],
        publishedAt: "2026-11-30T22:00:00.000Z",
        updatedAt: "2026-12-02T00:30:00.000Z",
        sources: [
          { url: "https://example.com/notices/1" },
          { url: null },
          { url: "https://example.com/stats/2?ref=public" },
          { url: "https://example.com/notices/1" },
        ],
      },
      "https://news.example",
    );
    expect(data).toMatchObject({
      "@type": "NewsArticle",
      headline: "告示",
      datePublished: "2026-12-01T07:00:00+09:00",
      dateModified: "2026-12-02T09:30:00+09:00",
      author: { "@type": "Organization", name: AI_AUTHOR_NAME },
      isBasedOn: ["https://example.com/notices/1", "https://example.com/stats/2?ref=public"],
    });
    expect(AI_AUTHOR_NAME).toBe("クロ（AI記者）");
    const json = serializeJsonLd(data);
    expect(json).toContain("https://news.example/articles/2026-12-01-07-notice/opengraph-image");
    expect(json).not.toContain("article_url");
    expect(json).not.toMatch(EMAIL);
    const pageUrl = "https://news.example/articles/2026-12-01-07-notice";
    expect(JSON.stringify(data?.url)).toBe(JSON.stringify(pageUrl));
    expect(String(data?.url)).not.toContain("?");
    expect(newsArticleJsonLd(
      {
        slug: "2026-12-01-07-notice",
        title: "告示",
        summary: ["一行", "二行", "三行"],
        publishedAt: "not-a-date",
        updatedAt: "2026-12-02T00:30:00.000Z",
        sources: [],
      },
      "https://news.example",
    )).toBeNull();

    const page = readFileSync(path.join(root, "app/articles/[slug]/page.tsx"), "utf8");
    expect(page).toContain("newsArticleJsonLd");
    expect(page).toContain("ArticleAnalytics");
    expect(page).toContain('type="application/ld+json"');
  });
});

describe("og image", () => {
  it("draws the title, the theme, and the AI label as text", () => {
    const html = renderToStaticMarkup(React.createElement(ogCard, { themeLabel: "福岡市", title: "告示の数値を公開した" }));
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("福岡市");
    expect(text).toContain("告示の数値を公開した");
    expect(text).toContain(OG_AI_LABEL);
    expect(OG_AI_LABEL).toBe("AIが作成");
    expect(html).not.toMatch(/<img[\s>/]/i);
    const source = readFileSync(path.join(root, "app/articles/[slug]/opengraph-image.tsx"), "utf8");
    expect(source).toContain("next/og");
    expect(source).toContain("OG_AI_LABEL");
    expect(source).toContain("loadPublishedArticle");
  });
});

describe("site origin", () => {
  it("uses the configured origin and rejects credentials", () => {
    expect(siteOrigin("https://news.example/path?token=secret")).toBe("https://news.example");
    expect(siteOrigin("https://user:secret@news.example")).toBeNull();
    expect(siteOrigin("not a url")).toBeNull();
    const previousSite = process.env.NEXT_PUBLIC_SITE_URL;
    const previousVercel = process.env.VERCEL_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://user:secret@news.example";
    process.env.VERCEL_URL = "preview.example";
    try {
      expect(resolveSiteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
      delete process.env.VERCEL_URL;
      expect(resolveSiteOrigin(null)).toBe("http://localhost:3000");
      process.env.NEXT_PUBLIC_SITE_URL = "https://news.example/base";
      expect(resolveSiteOrigin("https://preview.example")).toBe("https://news.example");
    } finally {
      restore("NEXT_PUBLIC_SITE_URL", previousSite);
      restore("VERCEL_URL", previousVercel);
    }
  });
});

function restore(name: "NEXT_PUBLIC_SITE_URL" | "VERCEL_URL", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("public copy", () => {
  it("does not put an email address in the new public modules", () => {
    const files = [
      "app/layout.tsx",
      "app/robots.ts",
      "app/sitemap.ts",
      "app/feed.xml/route.ts",
      "app/feed/[theme]/route.ts",
      "app/site/analytics.tsx",
      "app/articles/[slug]/page.tsx",
      "app/articles/[slug]/article-analytics.tsx",
      "app/articles/[slug]/opengraph-image.tsx",
      "lib/analytics/events.ts",
      "lib/seo/feed.ts",
      "lib/seo/news-article.ts",
      "lib/seo/sitemap.ts",
      "lib/seo/og.tsx",
      "lib/seo/og-mark.ts",
    ];
    const source = files.map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
    expect(source).not.toMatch(EMAIL);
    expect(source.toLowerCase()).not.toContain("mailto:");
  });
});
