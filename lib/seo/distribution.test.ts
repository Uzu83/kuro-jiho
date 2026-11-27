import { describe, expect, it } from "vitest";
import { toPublicArticle, type PublishedArticleRow } from "@/lib/articles/public";
import { formatJstOffset, formatRfc822Jst } from "@/lib/seo/dates";
import {
  articleViewProps,
  redactAnalyticsEvent,
  reportErrorProps,
  sourceClickProps,
} from "@/lib/seo/events";
import { buildRss, selectFeedEntries, themeFromFeedFile, type FeedSource } from "@/lib/seo/feed";
import { jsonLdScript, NEWS_AUTHOR, newsArticleData } from "@/lib/seo/news-article";
import { OG_BADGE, ogCard } from "@/lib/seo/og";
import { redactMeasuredUrl } from "@/lib/seo/public-url";
import { robotsDisallow, sitemapUrls } from "@/lib/seo/sitemap";

const origin = "https://news.example";

function source(overrides: Partial<FeedSource> = {}): FeedSource {
  return {
    slug: "2026-12-01-07-notice",
    title: "告示と統計",
    theme: "fukuoka",
    status: "published",
    publishedAt: "2026-12-01T07:00:00+09:00",
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    ...overrides,
  };
}

describe("measured urls", () => {
  it("drops the query, fragment, and credentials before an event is sent", () => {
    expect(redactMeasuredUrl("https://user:pass@news.example/articles/2026-12-01-07-notice?article_url=secret#top")).toBe(
      "https://news.example/articles/2026-12-01-07-notice",
    );
    expect(redactMeasuredUrl("https://news.example/admin/posts?token=secret")).toBeNull();
    expect(redactMeasuredUrl("https://news.example/api/kuro/articles?days=14")).toBeNull();
    expect(redactMeasuredUrl("https://news.example/administrator")).toBe("https://news.example/administrator");

    const event = redactAnalyticsEvent({
      type: "pageview" as const,
      url: "https://news.example/sports?utm_source=secret&email=person@example.com",
    });
    expect(event?.url).toBe("https://news.example/sports");
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("person@");
  });
});

describe("custom events", () => {
  it("sends theme and slot, or a source domain, and nothing that identifies a person", () => {
    expect(articleViewProps("fukuoka", "07")).toEqual({ theme: "fukuoka", slot: "07" });
    expect(articleViewProps("fukuoka", "09")).toBeNull();
    expect(articleViewProps("../admin", "07")).toBeNull();

    const click = sourceClickProps("sports", "https://www.example.com/notices/1?user=secret#part");
    expect(click).toEqual({ theme: "sports", domain: "www.example.com" });
    expect(JSON.stringify(click)).not.toContain("?");
    expect(JSON.stringify(click)).not.toContain("secret");
    expect(JSON.stringify(click)).not.toContain("/notices");
    expect(sourceClickProps("sports", "https://user:pass@example.com/a")).toBeNull();
    expect(sourceClickProps("sports", "http://example.com/a")).toBeNull();

    expect(reportErrorProps("f1")).toEqual({ theme: "f1" });
    expect(JSON.stringify(reportErrorProps("f1"))).not.toContain("article_url");
  });
});

describe("feeds and sitemap", () => {
  const rows = [
    source({ title: "告示 & <速報>" }),
    source({
      slug: "2026-12-01-12-draft",
      title: "下書き",
      status: "draft",
      summary: ["出してはいけない"],
    }),
    source({
      slug: "2026-12-01-17-hidden",
      title: "非公開",
      status: "unpublished",
      summary: ["出してはいけない"],
    }),
    source({
      slug: "2026-12-01-20-race",
      title: "決勝",
      theme: "f1",
      publishedAt: "2026-12-01T20:00:00+09:00",
      summary: ["決勝が行われた"],
    }),
  ];

  it("lists published articles only, with a summary and an absolute link", () => {
    const entries = selectFeedEntries(rows);
    expect(entries.map((entry) => entry.slug)).toEqual(["2026-12-01-07-notice", "2026-12-01-20-race"]);

    const xml = buildRss({ origin, selfPath: "/feed.xml", entries });
    expect(xml).not.toBeNull();
    if (!xml) {
      return;
    }
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>クロの時報</title>");
    expect(xml).toContain("<link>https://news.example/</link>");
    expect(xml).toContain("<description>");
    expect(xml).toContain("<language>ja</language>");
    expect(xml).toContain('href="https://news.example/feed.xml"');
    expect(xml).toContain("<link>https://news.example/articles/2026-12-01-07-notice</link>");
    expect(xml).toContain("告示が出た\n対象は市内\n詳細は出典のとおり");
    expect(xml).toContain("告示 &amp; &lt;速報&gt;");
    expect(xml).toContain("Tue, 01 Dec 2026 07:00:00 +0900");
    expect(xml).not.toContain("下書き");
    expect(xml).not.toContain("非公開");
    expect(xml).not.toContain("出してはいけない");
    expect(xml).not.toContain("/admin");
    expect(xml).not.toContain("/api");
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((match) => match[1] ?? "");
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => !link.includes("?"))).toBe(true);

    const themeXml = buildRss({
      origin,
      selfPath: "/feed/f1.xml",
      theme: "f1",
      entries,
    });
    expect(themeXml).not.toBeNull();
    if (!themeXml) {
      return;
    }
    expect(themeXml).toContain("https://news.example/feed/f1.xml");
    expect(themeXml).toContain("2026-12-01-20-race");
    expect(themeXml).not.toContain("2026-12-01-07-notice");
    expect(themeFromFeedFile("f1.xml")).toBe("f1");
    expect(themeFromFeedFile("admin.xml")).toBeNull();
    expect(themeFromFeedFile("f1")).toBeNull();
  });

  it("keeps drafts, unpublished articles, and private paths out of the sitemap", () => {
    const urls = sitemapUrls(selectFeedEntries(rows), origin);
    expect(urls).toEqual([
      "https://news.example/",
      "https://news.example/fukuoka",
      "https://news.example/it",
      "https://news.example/gadget",
      "https://news.example/sports",
      "https://news.example/f1",
      "https://news.example/articles/2026-12-01-07-notice",
      "https://news.example/articles/2026-12-01-20-race",
    ]);
    expect(urls.join("\n")).not.toContain("?");
    expect(robotsDisallow()).toEqual(["/admin", "/api"]);
  });
});

describe("article metadata", () => {
  it("formats Japan time with a fixed offset", () => {
    expect(formatJstOffset("2026-11-30T22:00:00.000Z")).toBe("2026-12-01T07:00:00+09:00");
    expect(formatRfc822Jst("2026-12-01T07:00:00+09:00")).toBe("Tue, 01 Dec 2026 07:00:00 +0900");
    expect(formatJstOffset("not-a-date")).toBeNull();
  });

  it("describes a NewsArticle without the report link", async () => {
    const row: PublishedArticleRow = {
      id: "article-1",
      slug: "2026-12-01-07-notice",
      title: "福岡市が告示を公開",
      theme: "fukuoka",
      slot: "07",
      status: "published",
      published_at: "2026-12-01T07:00:00+09:00",
      updated_at: "2026-12-02T09:30:00+09:00",
      summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
      body_md: "告示が出た［1］。",
      sources: [
        {
          id: "1",
          title: "告示",
          publisher: "福岡市",
          url: "https://www.city.example/notice?id=1",
          accessed_at: "2026-12-01T06:30:00+09:00",
        },
      ],
      verification: { checked: [], removed: [] },
      related: [],
    };
    const article = await toPublicArticle({ row, corrections: [], related: [], siteUrl: origin });
    expect(article).not.toBeNull();

    const data = newsArticleData(article!, origin);
    expect(data).not.toBeNull();
    if (!data) {
      return;
    }
    expect(data).toMatchObject({
      "@type": "NewsArticle",
      datePublished: "2026-12-01T07:00:00+09:00",
      dateModified: "2026-12-02T09:30:00+09:00",
      author: { "@type": "Organization", name: NEWS_AUTHOR },
      isBasedOn: ["https://www.city.example/notice?id=1"],
      mainEntityOfPage: "https://news.example/articles/2026-12-01-07-notice",
    });
    const script = jsonLdScript({ ...data, headline: '</script><script>alert(1)</script>' });
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c");
    expect(script).not.toContain("article_url");
    expect(ogCard({ title: article!.title, themeLabel: article!.themeLabel }).badge).toBe(OG_BADGE);
  });
});
