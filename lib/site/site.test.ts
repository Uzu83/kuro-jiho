import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AboutDocument } from "@/app/about/document";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { CorrectionsDocument } from "@/app/corrections/document";
import { HomeView } from "@/app/listings/views";
import { PolicyDocument } from "@/app/policy/document";
import { correctionReportHref, type PublicArticle } from "@/lib/articles/public";
import { createCorrectionDirectory } from "@/lib/corrections/directory";
import {
  readCorrectionList,
  toCorrectionList,
  type CorrectionArticleInput,
  type CorrectionNoteInput,
} from "@/lib/corrections/model";
import type { HomeModel } from "@/lib/listings/model";
import { OPERATOR } from "@/lib/site/operator";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    rel,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    rel?: string;
    "aria-current"?: "page";
  }) => React.createElement("a", { href, className, rel, "aria-current": ariaCurrent }, children),
}));

const root = path.resolve(import.meta.dirname, "../..");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

const PUBLIC_FILES = [
  "app/about/document.tsx",
  "app/about/page.tsx",
  "app/policy/document.tsx",
  "app/policy/page.tsx",
  "app/corrections/document.tsx",
  "app/corrections/page.tsx",
  "app/site/footer.tsx",
  "app/site/info-page.tsx",
  "lib/site/operator.ts",
  "lib/corrections/model.ts",
  "lib/corrections/directory.ts",
  "lib/corrections/load.ts",
  ".github/ISSUE_TEMPLATE/correction.yml",
];

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function copyrightName(): string {
  const license = readFileSync(path.join(root, "LICENSE"), "utf8");
  const match = license.match(/^Copyright \(c\) \d{4} (.+)$/m);
  expect(match?.[1]).toBeTruthy();
  return match![1]!.trim();
}

function formFields(yaml: string): { type: string; id: string; label: string }[] {
  return yaml
    .split(/\n\s*- type: /)
    .slice(1)
    .map((block) => ({
      type: block.slice(0, block.indexOf("\n")).trim(),
      id: block.match(/\n\s+id: ([^\n]+)/)?.[1]?.trim() ?? "",
      label: block.match(/\n\s+label: ([^\n]+)/)?.[1]?.trim() ?? "",
    }));
}

function articleInput(overrides: Partial<CorrectionArticleInput> = {}): CorrectionArticleInput {
  return {
    id: "article-1",
    slug: "2026-12-01-07-notice",
    title: "福岡市が告示を公開",
    theme: "fukuoka",
    status: "published",
    ...overrides,
  };
}

function noteInput(overrides: Partial<CorrectionNoteInput> = {}): CorrectionNoteInput {
  return {
    articleId: "article-1",
    createdAt: "2026-12-02T09:00:00+09:00",
    note: "古い訂正",
    version: 1,
    ...overrides,
  };
}

function publicArticle(): PublicArticle {
  return {
    slug: "2026-12-01-07-notice",
    title: "告示",
    themeLabel: "福岡市",
    publishedAt: "2026-12-01T07:00:00+09:00",
    publishedLabel: "2026年12月1日 7:00（日本時間）",
    updatedAt: "2026-12-01T07:00:00+09:00",
    updatedLabel: "2026年12月1日 7:00（日本時間）",
    summary: ["一行", "二行", "三行"],
    bodyHtml: "<p>本文</p>",
    sources: [],
    checked: [],
    removed: [],
    corrections: [],
    related: [],
    reportHref: correctionReportHref("https://news.example/articles/2026-12-01-07-notice"),
  };
}

describe("about and policy", () => {
  it("explains that AI writes, and names only the trade name and handle", () => {
    const html = renderToStaticMarkup(React.createElement(AboutDocument));
    const text = visibleText(html);

    expect(text).toContain("記事はすべてAIが書いています");
    const steps = ["集める", "書く", "確かめる", "公開", "訂正"];
    let previous = -1;
    for (const step of steps) {
      const index = html.indexOf(`<h3>${step}</h3>`);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(text).toContain("仕組みの設計");
    expect(text).toContain("事後チェック");
    expect(text).toContain("屋号");
    expect(text).toContain(OPERATOR.tradeName);
    expect(text).toContain("ハンドル");
    expect(text).toContain(OPERATOR.handle);
    expect(html).toContain('href="/policy"');
    expect(html).toContain('href="/corrections"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/feed.xml"');
  });

  it("states the source rules, trademark notice, CC BY 4.0, and cookieless analytics", () => {
    const html = renderToStaticMarkup(React.createElement(PolicyDocument));
    const text = visibleText(html);

    expect(text).toContain("一次情報");
    expect(text).toContain("新聞社の記事と写真は使いません");
    expect(text).toContain("福岡市のウェブサイトへリンクするときは、トップページだけにします");
    expect(html).toContain('href="https://www.city.fukuoka.lg.jp/"');
    expect(text).toContain("自分の言葉で短く要約");
    expect(text).toContain("誤りは消しません");
    expect(text).toContain("AIの限界");
    expect(text).toContain("「F1」などの名称は、各権利者の商標です。本サイトは非公式で、公式団体とは関係ありません。");
    expect(text).toContain("CC BY 4.0");
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/deed.ja"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(text).toContain("読者の個人情報は集めません");
    expect(text).toContain("Vercel Web Analytics");
    expect(text).toContain("Cookieなし");
    expect(text).toContain("記事のURL、誤りの箇所、根拠のURLだけです");
    expect(html).toContain('aria-current="page"');
  });
});

describe("personal data", () => {
  it("does not put a name from LICENSE or an email address on the new pages", () => {
    const name = copyrightName();
    const parts = name.split(/\s+/).filter((part) => part.length > 1);
    const rendered = [
      renderToStaticMarkup(React.createElement(AboutDocument)),
      renderToStaticMarkup(React.createElement(PolicyDocument)),
      renderToStaticMarkup(React.createElement(CorrectionsDocument, { items: [] })),
    ].join("\n");
    const sources = PUBLIC_FILES.map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
    const haystack = `${rendered}\n${sources}`;

    expect(haystack).not.toContain(name);
    for (const part of parts) {
      expect(haystack.toLowerCase()).not.toContain(part.toLowerCase());
    }
    expect(haystack).not.toMatch(EMAIL);
    expect(haystack.toLowerCase()).not.toContain("mailto:");
  });
});

describe("correction list", () => {
  it("lists each corrected published article once, newest correction first", () => {
    const items = toCorrectionList(
      [
        noteInput(),
        noteInput({
          createdAt: "2026-12-03T18:15:00+09:00",
          note: "新しい訂正",
          version: 2,
        }),
        noteInput({
          articleId: "article-2",
          createdAt: "2026-12-04T12:00:00+09:00",
          note: "別の記事の訂正",
          version: 3,
        }),
        noteInput({
          articleId: "article-1",
          createdAt: "2026-12-03T18:15:00+09:00",
          note: "同じ時刻の古い版",
          version: 1,
        }),
        noteInput({ articleId: "hidden", note: "下書きの訂正" }),
        noteInput({ articleId: "article-1", note: "   ", version: 4 }),
        noteInput({ articleId: "article-1", createdAt: "not-a-date", note: "時刻が無い", version: 5 }),
      ],
      [
        articleInput(),
        articleInput({
          id: "article-2",
          slug: "2026-12-04-12-later",
          title: "  あとの記事  ",
          theme: "sports",
        }),
        articleInput({
          id: "hidden",
          slug: "2026-12-01-17-hidden",
          title: "下書き",
          status: "draft",
        }),
        articleInput({
          id: "bad",
          slug: "not-a-slug",
          title: "形の違う記事",
        }),
        articleInput({
          id: "theme",
          slug: "2026-12-01-20-theme",
          title: "未知のテーマ",
          theme: "weather",
        }),
      ],
    );

    expect(items.map((item) => item.title)).toEqual(["あとの記事", "福岡市が告示を公開"]);
    expect(items[0]).toMatchObject({
      slug: "2026-12-04-12-later",
      themeLabel: "スポーツ",
      note: "別の記事の訂正",
      count: 1,
      latestLabel: "2026年12月4日 12:00（日本時間）",
    });
    expect(items[1]).toMatchObject({
      themeLabel: "福岡市",
      note: "新しい訂正",
      count: 3,
      latestLabel: "2026年12月3日 18:15（日本時間）",
    });
    expect(JSON.stringify(items)).not.toContain("下書き");
    expect(JSON.stringify(items)).not.toContain("形の違う記事");
    expect(JSON.stringify(items)).not.toContain("未知のテーマ");
    expect(JSON.stringify(items)).not.toContain("同じ時刻の古い版");
  });

  it("renders corrected articles and an empty state without raw HTML", () => {
    const filled = toCorrectionList(
      [noteInput({ note: '<script>alert("x")</script>' })],
      [articleInput({ title: '<img src="x">' })],
    );
    const html = renderToStaticMarkup(React.createElement(CorrectionsDocument, { items: filled }));
    const text = visibleText(html);

    expect(text).toContain("福岡市");
    expect(text).toContain("訂正 1件");
    expect(html).toContain('href="/articles/2026-12-01-07-notice#corrections"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain('href="/feed.xml"');

    const empty = renderToStaticMarkup(React.createElement(CorrectionsDocument, { items: [] }));
    expect(visibleText(empty)).toContain("訂正のある記事はまだありません。");
  });

  it("is empty when there is no directory", async () => {
    await expect(readCorrectionList(null)).resolves.toEqual([]);
  });
});

describe("correction directory", () => {
  it("reads published corrections without the actor column and hides database errors", async () => {
    const calls: { table: string; select: string; filters: string[] }[] = [];
    const secret = "postgres secret detail";

    function client(failOn?: "notes" | "articles") {
      return {
        from(table: string) {
          const call = { table, select: "", filters: [] as string[] };
          calls.push(call);
          const api = {
            select(columns: string) {
              call.select = columns;
              return api;
            },
            order() {
              return api;
            },
            in(column: string, values: readonly string[]) {
              call.filters.push(`in:${column}=${values.join(",")}`);
              return api;
            },
            eq(column: string, value: string) {
              call.filters.push(`${column}=${value}`);
              return api;
            },
            then(
              resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
              reject?: (reason: unknown) => unknown,
            ) {
              const failed = failOn === (table === "article_corrections" ? "notes" : "articles");
              const data =
                table === "article_corrections"
                  ? [
                      {
                        article_id: "article-1",
                        created_at: "2026-12-03T18:15:00+09:00",
                        note: "新しい訂正",
                        version: 2,
                      },
                    ]
                  : [
                      articleInput(),
                      articleInput({
                        id: "article-1",
                        title: "下書きの見出し",
                        status: "draft",
                      }),
                    ];
              return Promise.resolve({
                data: failed ? null : data,
                error: failed ? { message: secret } : null,
              }).then(resolve, reject);
            },
          };
          return api;
        },
      };
    }

    const items = await readCorrectionList(createCorrectionDirectory(client() as never));
    expect(items.map((item) => item.title)).toEqual(["福岡市が告示を公開"]);
    expect(calls.map((call) => call.table)).toEqual(["article_corrections", "articles"]);
    expect(calls[0]?.select).toBe("article_id, created_at, note, version");
    expect(calls[0]?.select).not.toContain("actor");
    expect(calls[0]?.select).not.toContain("snapshot");
    expect(calls[1]).toMatchObject({
      select: "id, slug, title, theme, status",
      filters: ["in:id=article-1", "status=published"],
    });
    expect(calls[1]?.select).not.toContain("body_md");

    calls.length = 0;
    const empty = await readCorrectionList(
      createCorrectionDirectory({
        from(table: string) {
          const call = { table, select: "", filters: [] as string[] };
          calls.push(call);
          const api = {
            select(columns: string) {
              call.select = columns;
              return api;
            },
            order() {
              return api;
            },
            then(
              resolve: (value: { data: unknown[]; error: null }) => unknown,
              reject?: (reason: unknown) => unknown,
            ) {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            },
          };
          return api;
        },
      } as never),
    );
    expect(empty).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(["article_corrections"]);

    await expect(
      readCorrectionList(createCorrectionDirectory(client("notes") as never)),
    ).rejects.toThrow("記事の取得に失敗しました");
    await expect(
      readCorrectionList(createCorrectionDirectory(client("articles") as never)),
    ).rejects.toThrow("記事の取得に失敗しました");
    try {
      await readCorrectionList(createCorrectionDirectory(client("notes") as never));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
    }
  });
});

describe("footer and report form", () => {
  it("links the public pages and RSS from the home page and the article", () => {
    const home: HomeModel = {
      date: "2026-12-01",
      dateLabel: "2026年12月1日",
      slots: [],
      themes: [],
    };
    const homeHtml = renderToStaticMarkup(React.createElement(HomeView, { home }));
    for (const href of ["/about", "/policy", "/corrections", "/feed.xml"]) {
      expect(homeHtml).toContain(`href="${href}"`);
    }

    const articleHtml = renderToStaticMarkup(
      React.createElement(ArticleDocument, { article: publicArticle() }),
    );
    expect(articleHtml).toContain('href="/policy"');
    expect(articleHtml).toContain('href="/corrections"');
    expect(articleHtml).toContain('href="/feed.xml"');
    expect(articleHtml).toContain("template=correction.yml");
    expect(articleHtml).toContain(
      "article_url=" + encodeURIComponent("https://news.example/articles/2026-12-01-07-notice"),
    );

    const preview = renderToStaticMarkup(
      React.createElement(ArticleDocument, { article: publicArticle(), embedded: true }),
    );
    expect(preview).not.toContain("site-footer");
  });

  it("prefills only the article URL on a form whose fields are the three requested ones", () => {
    const yaml = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/correction.yml"), "utf8");
    expect(formFields(yaml)).toEqual([
      { type: "input", id: "article_url", label: "記事URL" },
      { type: "textarea", id: "error_location", label: "誤りの箇所" },
      { type: "input", id: "evidence_url", label: "根拠URL" },
    ]);
    expect(yaml.match(/required: true/g)).toHaveLength(3);
    expect(yaml).not.toContain("type: markdown");

    const href = correctionReportHref("/articles/2026-12-01-07-notice");
    const url = new URL(href);
    expect(url.searchParams.get("template")).toBe("correction.yml");
    expect(url.searchParams.get("article_url")).toBe("/articles/2026-12-01-07-notice");
    expect([...url.searchParams.keys()].sort()).toEqual(["article_url", "template"]);
  });

  it("revalidates the corrections page with the public article cache", () => {
    const page = readFileSync(path.join(root, "app/corrections/page.tsx"), "utf8");
    const load = readFileSync(path.join(root, "lib/corrections/load.ts"), "utf8");
    expect(page).toContain("export const revalidate = 3600");
    expect(load).toContain("tryCreateAnonServerClient");
    expect(load).not.toContain("createServiceClient");
    expect(load).not.toContain("cookies(");
    expect(readFileSync(path.join(root, "lib/kuro/revalidate.ts"), "utf8")).toContain('"/corrections"');
  });
});
