import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArchiveView, HomeView, ThemeView } from "@/app/listings/views";
import type { ArticleSlot } from "@/lib/article-schema";
import { createListingDirectory, toListingArticle, toSlotSkip } from "@/lib/listings/directory";
import {
  HOME_THEME_LIMIT,
  LISTING_THEMES,
  buildDaySlots,
  parseArchiveDate,
  parsePageParam,
  readArchive,
  readHome,
  readTheme,
  selectThemePage,
  takeNewest,
  themePageHref,
  type ListingArticle,
  type ListingDirectory,
} from "@/lib/listings/model";

const root = path.resolve(import.meta.dirname, "../..");

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

function article(overrides: Partial<ListingArticle> = {}): ListingArticle {
  return {
    slug: "2026-12-01-07-notice",
    title: "告示を公開",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    publishedAt: "2026-12-01T07:00:00+09:00",
    summary: "告示が出た",
    ...overrides,
  };
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function directory(partial: Partial<ListingDirectory> = {}): ListingDirectory {
  return {
    async listPublishedOnDate() {
      return [];
    },
    async listSkipsOnDate() {
      return [];
    },
    async listNewestByTheme() {
      return [];
    },
    async listThemePage() {
      return { articles: [], total: 0 };
    },
    ...partial,
  };
}

describe("today slots in JST", () => {
  it("keeps today on the JST date from 0:00 through 8:59, when UTC is still the previous day", async () => {
    const asked: string[] = [];
    const source = directory({
      async listPublishedOnDate(date) {
        asked.push(`articles:${date}`);
        if (date !== "2026-12-01") {
          return [article({ date, slot: "20", title: "別の日", slug: "2026-11-30-20-other" })];
        }
        return [
          article({ date: "2026-11-30", slot: "07", title: "UTCの前日", slug: "2026-11-30-07-utc" }),
          article({ date: "2026-12-01", slot: "07", title: "今朝の記事" }),
        ];
      },
      async listSkipsOnDate(date) {
        asked.push(`skips:${date}`);
        return date === "2026-12-01"
          ? [{ date, slot: "20", status: "skipped" }]
          : [];
      },
    });

    for (const now of [
      "2026-11-30T15:00:00.000Z",
      "2026-11-30T23:59:59.000Z",
      "2026-12-01T00:00:00.000Z",
    ]) {
      asked.length = 0;
      const home = await readHome(source, new Date(now));
      expect(home.date).toBe("2026-12-01");
      expect(home.dateLabel).toBe("2026年12月1日");
      expect(asked).toEqual(["articles:2026-12-01", "skips:2026-12-01"]);
      expect(home.slots.map((slot) => slot.slot)).toEqual(["07", "12", "17", "20"]);
      expect(home.slots.map((slot) => slot.kind)).toEqual([
        "published",
        "scheduled",
        "scheduled",
        "skipped",
      ]);
      expect(home.slots[0]).toMatchObject({ article: { title: "今朝の記事" } });
      expect(home.slots[1]).toMatchObject({ label: "12時公開予定" });
      expect(home.slots[2]).toMatchObject({ label: "17時公開予定" });
      expect(home.slots[3]).toMatchObject({ label: "この枠は見送りました" });
    }
  });

  it("does not treat the previous JST evening as today", async () => {
    const asked: string[] = [];
    const home = await readHome(
      directory({
        async listPublishedOnDate(date) {
          asked.push(date);
          return [];
        },
        async listSkipsOnDate(date) {
          asked.push(date);
          return [];
        },
      }),
      new Date("2026-11-30T14:59:00.000Z"),
    );

    expect(home.date).toBe("2026-11-30");
    expect(asked).toEqual(["2026-11-30", "2026-11-30"]);
    expect(home.slots.every((slot) => slot.kind === "scheduled")).toBe(true);
    expect(home.slots[0]).toMatchObject({ label: "7時公開予定" });
  });

  it("shows published, scheduled, and skipped slots, and prefers a published article over a skip", () => {
    const slots = buildDaySlots({
      date: "2026-12-01",
      articles: [
        article({ slot: "07", title: "朝刊" }),
        article({
          slot: "17",
          title: "夕刊",
          slug: "2026-12-01-17-evening",
          publishedAt: "2026-12-01T17:00:00+09:00",
        }),
        article({
          slot: "17",
          title: "古い夕刊",
          slug: "2026-12-01-17-older",
          publishedAt: "2026-12-01T16:00:00+09:00",
        }),
      ],
      skips: [
        { date: "2026-12-01", slot: "17", status: "skipped" },
        { date: "2026-12-01", slot: "20", status: "skipped" },
        { date: "2026-11-30", slot: "12", status: "skipped" },
      ],
    });

    expect(slots.map((slot) => slot.kind)).toEqual(["published", "scheduled", "published", "skipped"]);
    expect(slots[2]).toMatchObject({ article: { title: "夕刊" } });
    expect(slots[1]).toMatchObject({ kind: "scheduled", label: "12時公開予定" });
    expect(slots[3]).toMatchObject({ kind: "skipped", label: "この枠は見送りました" });
  });

  it("renders the three states, five theme sections, and no images", async () => {
    const home = await readHome(
      directory({
        async listPublishedOnDate() {
          return [article({ title: "<script>朝刊</script>", summary: "3行の最初" })];
        },
        async listSkipsOnDate() {
          return [{ date: "2026-12-01", slot: "20", status: "skipped" }];
        },
        async listNewestByTheme(theme) {
          if (theme !== "sports") {
            return [];
          }
          return [
            article({
              theme: "fukuoka",
              title: "混ざった福岡",
              slug: "2026-12-01-12-fukuoka-extra",
              slot: "12",
            }),
            ...Array.from({ length: 6 }, (_, index) =>
              article({
                theme: "sports",
                title: `試合${index}`,
                slug: `2026-12-01-12-sports-${index}`,
                slot: "12",
                date: "2026-12-01",
                publishedAt: `2026-12-01T${String(12 + index).padStart(2, "0")}:00:00+09:00`,
              }),
            ),
          ];
        },
      }),
      new Date("2026-11-30T23:00:00.000Z"),
    );

    expect(home.themes.map((group) => group.theme)).toEqual([...LISTING_THEMES]);
    expect(home.themes.find((group) => group.theme === "sports")?.articles).toHaveLength(HOME_THEME_LIMIT);
    expect(home.themes.find((group) => group.theme === "sports")?.articles.every((item) => item.theme === "sports")).toBe(
      true,
    );
    expect(home.themes.find((group) => group.theme === "f1")?.articles).toEqual([]);

    const html = renderToStaticMarkup(React.createElement(HomeView, { home }));
    const text = visibleText(html);

    expect(text).toContain("この記事はすべてAIが書いています");
    expect(text).toContain("<script>朝刊</script>");
    expect(text).toContain("17時公開予定");
    expect(text).toContain("12時公開予定");
    expect(text).toContain("この枠は見送りました");
    expect(text).toContain("今日の4枠");
    expect(text).toContain("テーマ別の新着");
    expect(text).toContain("スポーツ");
    expect(text).toContain("福岡市");
    expect(text).toContain("IT");
    expect(text).toContain("ガジェット");
    expect(text).toContain("F1");
    expect(text).toContain("まだありません");
    expect(text).not.toContain("混ざった福岡");
    expect(html).toContain('href="/archive/2026-12-01"');
    expect(html).toContain('href="/articles/2026-12-01-07-notice"');
    expect(html).toContain('href="/sports"');
    expect(html).toContain('href="/fukuoka"');
    expect(html).toContain('href="/it"');
    expect(html).toContain('href="/gadget"');
    expect(html).toContain('href="/f1"');
    expect(html).not.toMatch(/<img[\s>/]/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("theme list", () => {
  it("filters to one theme, newest first, and pages the rest", () => {
    const articles = [
      article({
        theme: "sports",
        title: "古い試合",
        slug: "2026-12-01-07-sports-old",
        publishedAt: "2026-12-01T07:00:00+09:00",
      }),
      article({
        theme: "fukuoka",
        title: "福岡の告示",
        slug: "2026-12-01-12-fukuoka",
        slot: "12",
      }),
      article({
        theme: "sports",
        title: "新しい試合",
        slug: "2026-12-03-17-sports-new",
        slot: "17",
        date: "2026-12-03",
        publishedAt: "2026-12-03T17:00:00+09:00",
      }),
      article({
        theme: "sports",
        title: "同じ時刻のB",
        slug: "2026-12-02-12-sports-b",
        slot: "12",
        date: "2026-12-02",
        publishedAt: "2026-12-02T12:00:00+09:00",
      }),
      article({
        theme: "sports",
        title: "同じ時刻のA",
        slug: "2026-12-02-12-sports-a",
        slot: "12",
        date: "2026-12-02",
        publishedAt: "2026-12-02T12:00:00+09:00",
      }),
      article({
        theme: "f1",
        title: "予選",
        slug: "2026-12-01-20-qualifying",
        slot: "20",
      }),
    ];

    const page1 = selectThemePage(articles, "sports", 1, 2);
    const page2 = selectThemePage(articles, "sports", 2, 2);

    expect(page1.total).toBe(4);
    expect(page1.articles.map((item) => item.title)).toEqual(["新しい試合", "同じ時刻のB"]);
    expect(page2.articles.map((item) => item.title)).toEqual(["同じ時刻のA", "古い試合"]);
    expect(page1.articles.every((item) => item.theme === "sports")).toBe(true);
    expect(takeNewest(articles, "f1", 5).map((item) => item.title)).toEqual(["予選"]);
  });

  it("drops other themes returned for a page and rejects an empty page past the end", async () => {
    const model = await readTheme(
      directory({
        async listThemePage(theme, page) {
          expect(theme).toBe("sports");
          expect(page).toBe(1);
          return {
            articles: [
              article({ theme: "sports", title: "試合" }),
              article({ theme: "fukuoka", title: "福岡の告示", slug: "2026-12-01-12-fukuoka", slot: "12" }),
            ],
            total: 11,
          };
        },
      }),
      "sports",
      1,
    );

    expect(model.articles.map((item) => item.title)).toEqual(["試合"]);
    expect(model.totalPages).toBe(2);
    expect(model.outOfRange).toBe(false);

    const missing = await readTheme(
      directory({
        async listThemePage() {
          return { articles: [], total: 0 };
        },
      }),
      "it",
      2,
    );
    expect(missing.outOfRange).toBe(true);

    const pastTheLastPage = await readTheme(
      directory({
        async listThemePage() {
          return { articles: [], total: 10 };
        },
      }),
      "sports",
      2,
    );
    expect(pastTheLastPage.outOfRange).toBe(true);
    expect(pastTheLastPage.totalPages).toBe(1);

    const html = renderToStaticMarkup(
      React.createElement(ThemeView, {
        model: { ...model, page: 2, articles: model.articles },
      }),
    );
    const text = visibleText(html);
    expect(text).toContain("スポーツ");
    expect(text).toContain("試合");
    expect(text).not.toContain("福岡の告示");
    expect(text).toContain("前のページ");
    expect(html).toContain('href="/sports"');
    expect(html).toContain('rel="prev"');
    expect(html).not.toContain("次のページ");
    expect(html).not.toMatch(/<img[\s>/]/i);
  });

  it("rejects page numbers that are not positive integers", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam(["3"])).toBe(3);
    expect(parsePageParam("0")).toBeNull();
    expect(parsePageParam("01")).toBeNull();
    expect(parsePageParam("1.5")).toBeNull();
    expect(parsePageParam("nope")).toBeNull();
  });

  it("keeps the first page at the theme path and numbers the rest", () => {
    expect(themePageHref("sports", 1)).toBe("/sports");
    expect(themePageHref("f1", 2)).toBe("/f1/page/2");
  });
});

describe("archive", () => {
  it("shows that day's four slots and rejects dates that are not real JST calendar days", async () => {
    const asked: string[] = [];
    const archive = await readArchive(
      directory({
        async listPublishedOnDate(date) {
          asked.push(date);
          return [
            article({ date: "2026-12-02", slot: "07", title: "翌日", slug: "2026-12-02-07-next" }),
            article({
              date: "2026-12-01",
              slot: "12",
              title: "昼の記事",
              slug: "2026-12-01-12-noon",
              theme: "it",
            }),
          ];
        },
        async listSkipsOnDate(date) {
          asked.push(`skip:${date}`);
          return [{ date, slot: "17", status: "skipped" }];
        },
      }),
      "2026-12-01",
    );

    expect(asked).toEqual(["2026-12-01", "skip:2026-12-01"]);
    expect(archive?.slots.map((slot) => slot.kind)).toEqual([
      "scheduled",
      "published",
      "skipped",
      "scheduled",
    ]);
    expect(archive?.slots[1]).toMatchObject({ article: { title: "昼の記事" } });
    expect(await readArchive(directory(), "2026-02-29")).toBeNull();
    expect(await readArchive(directory(), "2026-12-1")).toBeNull();
    expect(await readArchive(directory(), "2026/12/01")).toBeNull();
    expect(parseArchiveDate("2024-02-29")).toBe("2024-02-29");

    const html = renderToStaticMarkup(React.createElement(ArchiveView, { archive: archive! }));
    const text = visibleText(html);
    expect(text).toContain("2026年12月1日");
    expect(text).toContain("昼の記事");
    expect(text).toContain("7時公開予定");
    expect(text).toContain("20時公開予定");
    expect(text).toContain("この枠は見送りました");
    expect(text).toContain("この記事はすべてAIが書いています");
    expect(text).not.toContain("翌日");
    expect(html).not.toMatch(/<img[\s>/]/i);
  });
});

describe("slot layout", () => {
  const slots = buildDaySlots({
    date: "2026-12-01",
    articles: [
      article({ title: "朝の記事", slug: "2026-12-01-07-morning", slot: "07", publishedAt: "2026-12-01T07:00:00+09:00" }),
      article({ title: "昼の記事", slug: "2026-12-01-12-noon", slot: "12", publishedAt: "2026-12-01T12:00:00+09:00" }),
    ],
    skips: [{ date: "2026-12-01", slot: "17", status: "skipped" }],
  });

  it("puts the newest published slot first and keeps the other slots as one-line rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveView, { archive: { date: "2026-12-01", dateLabel: "2026年12月1日", slots } }),
    );
    const items = html.split("<li ").slice(1);

    expect(items).toHaveLength(4);
    expect(items[0]).toContain("昼の記事");
    expect(items[0]).toContain("12時");
    expect(items.slice(1).map((item) => visibleText(item))).toEqual([
      expect.stringContaining("7時朝の記事"),
      expect.stringContaining("17時この枠は見送りました"),
      expect.stringContaining("20時公開予定"),
    ]);
    // 要約は先頭の枠だけ。細い行には出さない。
    expect(items[0]).toContain("告示が出た");
    expect(items.slice(1).join("")).not.toContain("告示が出た");
  });

  it("shows the date next to the masthead on the home page without the time zone note", async () => {
    const home = await readHome(directory(), new Date("2026-12-01T00:00:00.000Z"));
    const html = renderToStaticMarkup(React.createElement(HomeView, { home }));
    const text = visibleText(html);

    expect(text).toContain("クロの時報AI記者クロ2026年12月1日");
    expect(text).not.toContain("日本時間");
    expect(html).toContain('href="/archive/2026-12-01"');
  });
});

describe("createListingDirectory", () => {
  it("reads published articles and public skips without reason or drafts", async () => {
    const calls: { table: string; select: string; filters: string[]; limit?: number; range?: string }[] = [];
    const secret = "postgres://db.internal/secret-database";
    const client = {
      from(table: string) {
        const call = { table, select: "", filters: [] as string[], limit: undefined as number | undefined, range: undefined as string | undefined };
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
          limit(value: number) {
            call.limit = value;
            return api;
          },
          range(from: number, to: number) {
            call.range = `${from}-${to}`;
            return api;
          },
          then(
            resolve: (value: { data: unknown; error: { message?: string } | null; count: number | null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            if (table === "slot_logs_public") {
              return Promise.resolve({
                data: [
                  {
                    date: "2026-12-01",
                    slot: "20",
                    status: "skipped",
                    reason: "一次情報が足りない",
                  },
                  { date: "2026-12-01", slot: "99", status: "skipped" },
                ],
                error: null,
                count: null,
              }).then(resolve, reject);
            }
            if (call.filters.includes("theme=sports")) {
              return Promise.resolve({
                data: [
                  row({ status: "draft", title: "下書き" }),
                  row({
                    theme: "fukuoka",
                    title: "別テーマ",
                    slug: "2026-12-01-12-other",
                    slot: "12",
                  }),
                  row({ theme: "sports", title: "試合", slug: "2026-12-01-07-sports" }),
                ],
                error: null,
                count: 1,
              }).then(resolve, reject);
            }
            return Promise.resolve({
              data: [row({ status: "draft", title: "下書き" }), row({ title: "公開" })],
              error: null,
              count: 1,
            }).then(resolve, reject);
          },
        };
        return api;
      },
    };

    const listing = createListingDirectory(client as never);
    const published = await listing.listPublishedOnDate("2026-12-01");
    const skips = await listing.listSkipsOnDate("2026-12-01");
    const newest = await listing.listNewestByTheme("sports", 5);
    const page = await listing.listThemePage("sports", 2, 10);

    expect(published.map((item) => item.title)).toEqual(["公開"]);
    expect(skips).toEqual([{ date: "2026-12-01", slot: "20", status: "skipped" }]);
    expect(JSON.stringify(skips)).not.toContain("一次情報");
    expect(newest.map((item) => item.title)).toEqual(["試合"]);
    expect(page).toEqual({ articles: [expect.objectContaining({ title: "試合" })], total: 1 });
    expect(calls.map((call) => call.table)).toEqual([
      "articles",
      "slot_logs_public",
      "articles",
      "articles",
    ]);
    expect(calls[0]).toMatchObject({
      select: "slug, title, theme, slot, date, status, published_at, summary",
      filters: ["status=published", "date=2026-12-01"],
    });
    expect(calls[1]?.select).toBe("date, slot, status");
    expect(calls[1]?.select).not.toContain("reason");
    expect(calls[2]).toMatchObject({ filters: ["status=published", "theme=sports"], limit: 5 });
    expect(calls[3]).toMatchObject({ filters: ["status=published", "theme=sports"], range: "10-19" });

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
          limit() {
            return api;
          },
          range() {
            return api;
          },
          then(
            resolve: (value: { data: null; error: { message: string }; count: null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({ data: null, error: { message: secret }, count: null }).then(resolve, reject);
          },
        };
        return api;
      },
    };

    await expect(createListingDirectory(failing as never).listPublishedOnDate("2026-12-01")).rejects.toThrow(
      "記事の取得に失敗しました",
    );
    try {
      await createListingDirectory(failing as never).listSkipsOnDate("2026-12-01");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain("postgres");
    }
  });

  it("treats a page past the last row as empty instead of a database failure", async () => {
    const secret = "postgres://db.internal/range-secret";
    const seen: string[] = [];
    const client = {
      from(table: string) {
        const call = { head: false, ranged: false, filters: [] as string[] };
        const api = {
          select(_columns: string, options?: { head?: boolean }) {
            call.head = options?.head === true;
            return api;
          },
          eq(column: string, value: string) {
            call.filters.push(`${column}=${value}`);
            return api;
          },
          order() {
            return api;
          },
          range() {
            call.ranged = true;
            return api;
          },
          then(
            resolve: (value: {
              data: null;
              error: { code?: string; message?: string } | null;
              count: number | null;
              status: number;
            }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            seen.push(
              `${table}:${call.head ? "head" : "rows"}:${call.filters.join("&")}`,
            );
            if (call.ranged) {
              return Promise.resolve({
                data: null,
                error: { code: "PGRST103", message: secret },
                count: null,
                status: 416,
              }).then(resolve, reject);
            }
            return Promise.resolve({ data: null, error: null, count: 10, status: 200 }).then(resolve, reject);
          },
        };
        return api;
      },
    };

    const page = await createListingDirectory(client as never).listThemePage("sports", 2, 10);

    expect(page).toEqual({ articles: [], total: 10 });
    expect(seen).toEqual([
      "articles:rows:status=published&theme=sports",
      "articles:head:status=published&theme=sports",
    ]);
    expect(JSON.stringify(page)).not.toContain(secret);
    expect(JSON.stringify(page)).not.toContain("postgres");
  });

  it("drops rows that are not publicly listable", () => {
    expect(toListingArticle(row({ status: "unpublished" }))).toBeNull();
    expect(toListingArticle(row({ slug: "not-a-slug" }))).toBeNull();
    expect(toListingArticle(row({ published_at: null }))).toBeNull();
    expect(
      toSlotSkip({ date: "2026-12-01", slot: "07", status: "published" }),
    ).toBeNull();
  });
});

describe("listing page contract", () => {
  it("revalidates hourly through the anon articles cache", () => {
    for (const file of ["app/page.tsx", "app/[theme]/page.tsx", "app/archive/[date]/page.tsx"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("export const revalidate = 3600");
    }

    const theme = readFileSync(path.join(root, "app/[theme]/page.tsx"), "utf8");
    const themeBody = readFileSync(path.join(root, "app/listings/theme-page.tsx"), "utf8");
    const archive = readFileSync(path.join(root, "app/archive/[date]/page.tsx"), "utf8");
    const load = readFileSync(path.join(root, "lib/listings/load.ts"), "utf8");

    expect(themeBody).toContain("notFound()");
    expect(theme).toContain("generateStaticParams");
    const numbered = readFileSync(path.join(root, "app/[theme]/page/[page]/page.tsx"), "utf8");
    expect(numbered).toContain("export const revalidate = 3600");
    expect(numbered).toContain("generateStaticParams");
    expect(archive).toContain("notFound()");
    expect(archive).toContain("generateStaticParams");
    expect(load).toContain("tryCreateAnonServerClient");
    expect(load).not.toContain("createServiceClient");
    expect(load).not.toContain("cookies(");
  });
});

function row(
  overrides: Partial<{
    slug: string;
    title: string;
    theme: string;
    slot: string;
    date: string;
    status: string;
    published_at: string | null;
    summary: string[];
  }> = {},
) {
  return {
    slug: "2026-12-01-07-notice",
    title: "告示を公開",
    theme: "fukuoka",
    slot: "07" as ArticleSlot,
    date: "2026-12-01",
    status: "published",
    published_at: "2026-12-01T07:00:00+09:00",
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    ...overrides,
  };
}
