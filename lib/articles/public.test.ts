import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { createArticleDirectory } from "@/lib/articles/directory";
import {
  correctionReportHref,
  formatJst,
  linkCitations,
  renderArticleBody,
  toPublicArticle,
  type CorrectionRow,
  type PublishedArticleRow,
  type RelatedRow,
} from "@/lib/articles/public";
import { readPublishedArticle, type ArticleDirectory } from "@/lib/articles/read";
import { ARTICLE_PAGE_REVALIDATE_SECONDS, tryCreateAnonServerClient } from "@/lib/supabase/anon";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

const slug = "2026-12-01-07-notice";
const root = path.resolve(import.meta.dirname, "../..");

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function row(overrides: Partial<PublishedArticleRow> = {}): PublishedArticleRow {
  return {
    id: "article-1",
    slug,
    title: "福岡市が告示を公開",
    theme: "fukuoka",
    status: "published",
    published_at: "2026-12-01T07:00:00+09:00",
    updated_at: "2026-12-02T09:30:00+09:00",
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    body_md: "告示が出た［1］。件数は統計のとおり［2］。\n\n人間が書いた、とは書いていない。",
    sources: [
      {
        id: "1",
        title: "告示",
        publisher: "福岡市",
        url: "https://example.com/notices/1",
        accessed_at: "2026-12-01T06:30:00+09:00",
        license: "公開情報",
      },
      {
        id: "2",
        title: "統計",
        publisher: "総務省",
        url: "https://example.com/stats/2",
        accessed_at: "2026-12-01T06:40:00+09:00",
      },
    ],
    verification: {
      checked: [
        { claim: "告示が公開された", source_ids: ["1"] },
        { claim: "件数は統計のとおり", source_ids: ["2"] },
      ],
      removed: [{ claim: "速報の人数", reason: "公式資料に数値がなかった" }],
    },
    related: ["2026-11-30-20-older-note", "2026-11-30-17-hidden-note"],
    ...overrides,
  };
}

function corrections(): CorrectionRow[] {
  return [
    {
      id: "older",
      created_at: "2026-12-02T09:00:00+09:00",
      note: "古い訂正",
      version: 1,
    },
    {
      id: "newer",
      created_at: "2026-12-03T18:15:00+09:00",
      note: "新しい訂正",
      version: 2,
    },
  ];
}

function relatedRows(): RelatedRow[] {
  return [
    { slug: "2026-11-30-20-older-note", title: "前日のメモ", status: "published" },
    { slug: "2026-11-30-17-hidden-note", title: "下書きのメモ", status: "draft" },
  ];
}

function directory(article: PublishedArticleRow | null, extra?: Partial<ArticleDirectory>): ArticleDirectory {
  return {
    async findPublished() {
      return article;
    },
    async listCorrections() {
      return corrections();
    },
    async listPublishedRelated() {
      return relatedRows();
    },
    ...extra,
  };
}

async function htmlFor(articleRow: PublishedArticleRow, notes: CorrectionRow[] = corrections()) {
  const article = await toPublicArticle({
    row: articleRow,
    corrections: notes,
    related: relatedRows(),
    siteUrl: "https://news.example",
  });
  expect(article).not.toBeNull();
  return {
    article: article!,
    html: renderToStaticMarkup(React.createElement(ArticleDocument, { article: article! })),
  };
}

describe("formatJst", () => {
  it("formats an instant in Japan time without a leading hour zero", () => {
    expect(formatJst("2026-11-30T22:00:00.000Z")).toBe("2026年12月1日 7:00（日本時間）");
    expect(formatJst("2026-12-01T07:05:00+09:00")).toBe("2026年12月1日 7:05（日本時間）");
    expect(formatJst("2026-12-01T15:00:00.000Z")).toBe("2026年12月2日 0:00（日本時間）");
    expect(formatJst("not-a-date")).toBeNull();
  });
});

describe("article page", () => {
  it("shows the AI label, sources, verification, and correction history", async () => {
    const { html } = await htmlFor(row());
    const text = visibleText(html);

    expect(text).toContain(
      "この記事はAI記者クロが公式発表をもとに作成しました。誤りがあればお知らせください",
    );
    expect(html).toContain('href="/about"');
    expect(text.indexOf("福岡市")).toBeLessThan(text.indexOf("福岡市が告示を公開"));
    expect(html.indexOf("article-ai")).toBeLessThan(html.indexOf("3行要約"));
    expect(html.indexOf("3行要約")).toBeLessThan(html.indexOf("article-body"));
    expect(text).toContain("公開 2026年12月1日 7:00（日本時間）");
    expect(text).toContain("更新 2026年12月2日 9:30（日本時間）");
    expect(text).toContain("告示が出た");
    expect(text).toContain("対象は市内");
    expect(text).toContain("詳細は出典のとおり");

    expect(html).toContain('href="#source-1"');
    expect(html).toContain('href="#source-2"');
    expect(html).toContain('id="source-1"');
    expect(html).toContain('id="source-2"');
    expect(html).toContain('href="https://example.com/notices/1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(text).toContain("発行元：福岡市");
    expect(text).toContain("発行元：総務省");
    expect(text).toContain("確認：");
    expect(text).toContain("2026年12月1日 6:30（日本時間）");
    expect(text.split("ライセンス：")).toHaveLength(2);
    expect(text).toContain("ライセンス：公開情報");

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(text).toContain("告示が公開された");
    expect(text).toContain("件数は統計のとおり");
    expect(text).toContain("速報の人数");
    expect(text).toContain("公式資料に数値がなかった");

    expect(html).toContain('href="#corrections"');
    expect(text).toContain("訂正あり");
    expect(text.indexOf("新しい訂正")).toBeLessThan(text.indexOf("古い訂正"));
    expect(text).toContain("2026年12月3日 18:15（日本時間）");
    expect(text).toContain("前日のメモ");
    expect(html).toContain('href="/articles/2026-11-30-20-older-note"');
    expect(text).not.toContain("下書きのメモ");
    expect(html).toContain("template=correction.yml");
    expect(html).toContain(
      "article_url=" + encodeURIComponent("https://news.example/articles/2026-12-01-07-notice"),
    );
    expect(text).toContain("誤りを報告");
  });

  it("keeps the AI label when the body never mentions it and there is no correction", async () => {
    const { html } = await htmlFor(
      row({
        body_md: "この原稿にAIという語は出てこない［1］。",
        sources: [
          {
            id: "1",
            title: "告示",
            publisher: "福岡市",
            url: "https://example.com/notices/1",
            accessed_at: "2026-12-01T06:30:00+09:00",
          },
        ],
      }),
      [],
    );
    const text = visibleText(html);

    expect(text).toContain(
      "この記事はAI記者クロが公式発表をもとに作成しました。誤りがあればお知らせください",
    );
    expect(text).not.toContain("訂正あり");
    expect(text).toContain("訂正はまだありません。");
  });

  it("does not render raw HTML, scripts, or images from the article", async () => {
    const { html } = await htmlFor(
      row({
        title: '<script>alert("title")</script>',
        summary: ['<img src="x" onerror="alert(1)">', "二行目", "三行目"],
        body_md: [
          "本文［1］。",
          "",
          '<script>alert("xss")</script>',
          '<SCRIPT src="https://evil.example/a.js"></SCRIPT>',
          '<img src="x" onerror="alert(1)">',
          '<a href="javascript:alert(1)">click</a>',
          "[click](javascript:alert(1))",
          '［1"><script>alert(1)</script>］',
          "![図](https://example.com/secret.png)",
          "",
          "# 本文見出し",
        ].join("\n"),
        sources: [
          {
            id: "1",
            title: '<script>alert("source")</script>',
            publisher: '"><img src=x onerror=alert(1)>',
            url: "javascript:alert(1)",
            accessed_at: "2026-12-01T06:30:00+09:00",
            license: "<script>alert(1)</script>",
          },
        ],
        verification: {
          checked: [{ claim: '<script>alert("claim")</script>', source_ids: ["1"] }],
          removed: [{ claim: "<b>外した</b>", reason: "<img src=x onerror=alert(1)>" }],
        },
      }),
      [
        {
          id: "corr",
          created_at: "2026-12-03T18:15:00+09:00",
          note: '<script>alert("note")</script>',
          version: 2,
        },
      ],
    );

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<\/script/i);
    expect(html).not.toMatch(/<img[\s>/]/i);
    expect(html).not.toMatch(/<[^>]*\sonerror\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("URLは表示できません");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("<h2>本文見出し</h2>");
    expect(html).not.toContain("<h1>本文見出し</h1>");
    expect(visibleText(html)).toContain(
      "この記事はAI記者クロが公式発表をもとに作成しました。誤りがあればお知らせください",
    );
  });

  it("links only known numeric citations", () => {
    const html = linkCitations('<p>本文［1］と［99］と<code>［1］</code></p>', new Set(["1"]));

    expect(html).toContain('<a href="#source-1">［1］</a>');
    expect(html).toContain("［99］");
    expect(html).not.toContain('href="#source-99"');
  });

  it("does not nest a citation link inside an existing link", async () => {
    const html = await renderArticleBody(
      "本文［1］。[発表［1］の詳細](https://example.com/notice)",
      ["1"],
    );
    const nested = linkCitations(
      '<p><a href="https://example.com/notice">発表<strong>［1］</strong>の詳細</a>［2］</p>',
      new Set(["1", "2"]),
    );

    expect(html).toContain('<a href="#source-1">［1］</a>');
    expect(html).toContain('<a href="https://example.com/notice">発表［1］の詳細</a>');
    expect(html).not.toContain("<a href=\"https://example.com/notice\">発表<a");
    expect(nested).toContain(
      '<a href="https://example.com/notice">発表<strong>［1］</strong>の詳細</a>',
    );
    expect(nested).toContain('<a href="#source-2">［2］</a>');
    expect(nested).not.toContain('href="#source-1"');
  });
});

describe("readPublishedArticle", () => {
  it("hides drafts, unpublished articles, and unknown slugs", async () => {
    const calls: string[] = [];
    const missing = directory(null, {
      async findPublished(asked) {
        calls.push(asked);
        return null;
      },
    });

    expect(await readPublishedArticle(slug, missing)).toBeNull();
    expect(calls).toEqual([slug]);
    expect(await readPublishedArticle("not a slug", missing)).toBeNull();
    expect(calls).toEqual([slug]);

    for (const status of ["draft", "unpublished"]) {
      expect(await readPublishedArticle(slug, directory(row({ status })))).toBeNull();
    }
  });

  it("does not turn a failed read into an empty page", async () => {
    await expect(
      readPublishedArticle(
        slug,
        directory(row(), {
          async listCorrections() {
            throw new Error("記事の取得に失敗しました");
          },
        }),
      ),
    ).rejects.toThrow("記事の取得に失敗しました");
  });
});

describe("createArticleDirectory", () => {
  it("asks for published rows and drops a draft that still comes back", async () => {
    const seen: string[] = [];
    const client = {
      from(table: string) {
        const filters: string[] = [];
        const api = {
          select() {
            return api;
          },
          eq(column: string, value: string) {
            filters.push(`${column}=${value}`);
            return api;
          },
          in() {
            return api;
          },
          order() {
            return api;
          },
          maybeSingle() {
            seen.push(`${table}:${filters.join("&")}`);
            return Promise.resolve({
              data: row({ status: "draft" }),
              error: null,
            });
          },
          then(
            resolve: (value: { data: unknown; error: { message?: string } | null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return api;
      },
    };

    const found = await createArticleDirectory(client as never).findPublished(slug);

    expect(found).toBeNull();
    expect(seen).toEqual([`articles:slug=${slug}&status=published`]);
  });

  it("does not include the database message in the failure", async () => {
    const secret = "postgres://db.internal/secret-database";
    const client = {
      from() {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          in() {
            return api;
          },
          order() {
            return api;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: { message: secret } });
          },
        };
        return api;
      },
    };

    await expect(createArticleDirectory(client as never).findPublished(slug)).rejects.toThrow(
      "記事の取得に失敗しました",
    );
    try {
      await createArticleDirectory(client as never).findPublished(slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain("postgres");
    }
  });
});

describe("public article page contract", () => {
  it("revalidates hourly and tags the anon read for on-demand updates", () => {
    expect(ARTICLE_PAGE_REVALIDATE_SECONDS).toBe(3600);
    const page = readFileSync(path.join(root, "app/articles/[slug]/page.tsx"), "utf8");
    const anon = readFileSync(path.join(root, "lib/supabase/anon.ts"), "utf8");

    expect(page).toContain("export const revalidate = 3600");
    expect(page).toContain("generateStaticParams");
    expect(page).toContain("notFound()");
    expect(anon).toContain("ARTICLE_CACHE_TAG");
    expect(anon).toContain("ARTICLE_PAGE_REVALIDATE_SECONDS");
    expect(correctionReportHref("/articles/2026-12-01-07-notice")).toContain("template=correction.yml");
  });

  it("returns null when Supabase is not configured", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      expect(tryCreateAnonServerClient()).toBeNull();
      process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-placeholder-value";
      expect(tryCreateAnonServerClient()).toBeNull();
    } finally {
      restore("NEXT_PUBLIC_SUPABASE_URL", previousUrl);
      restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", previousKey);
    }
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
