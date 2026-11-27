import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArchiveBoard, HomeBoard, ThemeBoard } from "@/app/listings";
import {
  AI_BANNER,
  buildDaySlots,
  HOME_THEMES,
  pageCount,
  parsePageParam,
  SKIPPED_LABEL,
  themeName,
  themeSections,
  todayInJst,
  type ListingArticle,
} from "@/lib/articles/board";
import { toListingArticle } from "@/lib/articles/catalog";
import { themeLabel } from "@/lib/articles/public";
import { isIsoDate } from "@/lib/kuro/dates";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    rel,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    rel?: string;
    "aria-current"?: "page";
  }) => React.createElement("a", { href, className, rel, ...rest }, children),
}));

function article(overrides: Partial<ListingArticle> & Pick<ListingArticle, "slug" | "slot" | "theme">): ListingArticle {
  return {
    title: overrides.title ?? overrides.slug,
    date: overrides.date ?? "2026-11-27",
    publishedAt: overrides.publishedAt ?? "2026-11-26T22:00:00.000Z",
    slug: overrides.slug,
    slot: overrides.slot,
    theme: overrides.theme,
  };
}

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("JST today", () => {
  it("stays on the Japan calendar from 00:00 through 09:00, which is still the previous UTC day", () => {
    expect(todayInJst(new Date("2026-11-26T15:30:00.000Z"))).toBe("2026-11-27");
    expect(todayInJst(new Date("2026-11-26T23:30:00.000Z"))).toBe("2026-11-27");
    expect(todayInJst(new Date("2026-11-27T00:00:00.000Z"))).toBe("2026-11-27");
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-11-27")).toBe(true);
  });
});

describe("day slots", () => {
  it("shows a published article, a skip, and scheduled slots", () => {
    const slots = buildDaySlots({
      date: "2026-11-27",
      articles: [
        article({
          slug: "2026-11-27-07-notice",
          slot: "07",
          theme: "fukuoka",
          title: "朝の発表",
        }),
        article({
          slug: "2026-11-26-12-old",
          slot: "12",
          theme: "it",
          date: "2026-11-26",
          title: "昨日の記事",
        }),
      ],
      skips: [
        { date: "2026-11-27", slot: "12" },
        { date: "2026-11-27", slot: "17" },
      ],
    });

    expect(slots.map((slot) => slot.state)).toEqual(["published", "skipped", "skipped", "scheduled"]);
    expect(slots[0]).toMatchObject({ title: "朝の発表", href: "/articles/2026-11-27-07-notice" });
    expect(slots[1]).toMatchObject({ label: SKIPPED_LABEL });
    expect(slots[3]).toMatchObject({ slot: "20", label: "20:00公開予定" });
  });

  it("prefers a published article over a skip in the same slot", () => {
    const slots = buildDaySlots({
      date: "2026-11-27",
      articles: [article({ slug: "2026-11-27-17-go", slot: "17", theme: "sports", title: "夕方" })],
      skips: [{ date: "2026-11-27", slot: "17" }],
    });
    expect(slots.find((slot) => slot.slot === "17")).toMatchObject({ state: "published", title: "夕方" });
  });
});

describe("theme lists and archive", () => {
  it("uses the same theme names as the article page and keeps five sections", () => {
    for (const theme of HOME_THEMES) {
      expect(themeName(theme)).toBe(themeLabel(theme));
    }

    const sections = themeSections({
      sports: [article({ slug: "2026-11-27-07-sports", slot: "07", theme: "sports", title: "試合" })],
      fukuoka: [],
      it: [],
      gadget: [],
      f1: [],
    });
    expect(sections.map((section) => section.label)).toEqual(["スポーツ", "福岡市", "IT", "ガジェット", "F1"]);
    expect(sections[0]?.articles).toHaveLength(1);
  });

  it("renders the home banner, three slot states, five themes, and an archive day", () => {
    const slots = buildDaySlots({
      date: "2026-11-27",
      articles: [article({ slug: "2026-11-27-07-notice", slot: "07", theme: "f1", title: "朝の発表" })],
      skips: [{ date: "2026-11-27", slot: "12" }],
    });
    const themes = themeSections({
      sports: [],
      fukuoka: [],
      it: [],
      gadget: [],
      f1: [article({ slug: "2026-11-27-07-notice", slot: "07", theme: "f1", title: "朝の発表" })],
    });

    const home = html(React.createElement(HomeBoard, { today: "2026-11-27", slots, themes }));
    expect(home).toContain(AI_BANNER);
    expect(home).toContain("朝の発表");
    expect(home).toContain(SKIPPED_LABEL);
    expect(home).toContain("17:00公開予定");
    expect(home).toContain("20:00公開予定");
    expect(home).toContain('href="/archive/2026-11-27"');
    for (const label of ["スポーツ", "福岡市", "IT", "ガジェット", "F1"]) {
      expect(home).toContain(label);
    }

    const archive = html(React.createElement(ArchiveBoard, { date: "2026-11-27", slots }));
    expect(archive).toContain("2026年11月27日");
    expect(archive).toContain("朝の発表");
    expect(archive).toContain(SKIPPED_LABEL);
    expect(archive).toContain(AI_BANNER);

    const theme = html(
      React.createElement(ThemeBoard, {
        theme: "sports",
        label: "スポーツ",
        page: 1,
        pages: 2,
        articles: [article({ slug: "2026-11-27-20-match", slot: "20", theme: "sports", title: "夜の試合" })],
      }),
    );
    expect(theme).toContain("夜の試合");
    expect(theme).toContain('href="/sports?page=2"');
    expect(theme).toContain("次のページ");
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("abc")).toBeNull();
    expect(pageCount(21, 20)).toBe(2);
  });
});

describe("listing rows", () => {
  it("drops a row that has no publication time", () => {
    expect(
      toListingArticle({
        slug: "2026-11-27-07-notice",
        title: "朝",
        theme: "fukuoka",
        slot: "07",
        date: "2026-11-27",
        published_at: null,
      }),
    ).toBeNull();
    expect(
      toListingArticle({
        slug: "2026-11-27-07-notice",
        title: "朝",
        theme: "fukuoka",
        slot: "07",
        date: "2026-11-27T00:00:00+09:00",
        published_at: "2026-11-26T22:00:00.000Z",
      })?.date,
    ).toBe("2026-11-27");
  });
});
