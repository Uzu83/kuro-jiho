import { ARTICLE_SLOTS, ARTICLE_THEMES, type ArticleSlot, type ArticleTheme } from "@/lib/article-schema";
import { jstDate } from "@/lib/kuro/dates";

/** トップとナビゲーションの並び。Issue #6 のパス順。 */
export const HOME_THEMES = ["sports", "fukuoka", "it", "gadget", "f1"] as const satisfies readonly ArticleTheme[];

export const HOME_THEME_LIMIT = 5;
export const THEME_PAGE_SIZE = 20;

export const AI_BANNER = "この記事はすべてAIが書いています";
export const SKIPPED_LABEL = "この枠は見送りました";
export const EMPTY_THEME_LABEL = "まだ記事がありません";

const THEME_LABELS: Record<ArticleTheme, string> = {
  fukuoka: "福岡市",
  it: "IT",
  gadget: "ガジェット",
  sports: "スポーツ",
  f1: "F1",
};

export type ListingArticle = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  publishedAt: string;
};

export type SlotSkip = {
  date: string;
  slot: string;
};

export type PublishedSlot = {
  slot: ArticleSlot;
  state: "published";
  slug: string;
  title: string;
  themeLabel: string;
  href: string;
};

export type ScheduledSlot = {
  slot: ArticleSlot;
  state: "scheduled";
  label: string;
};

export type SkippedSlot = {
  slot: ArticleSlot;
  state: "skipped";
  label: string;
};

export type DaySlot = PublishedSlot | ScheduledSlot | SkippedSlot;

export type ThemeSection = {
  theme: ArticleTheme;
  label: string;
  href: string;
  articles: ListingArticle[];
};

export function themeName(theme: string): string {
  if ((ARTICLE_THEMES as readonly string[]).includes(theme)) {
    return THEME_LABELS[theme as ArticleTheme];
  }
  return "テーマ";
}

export function asTheme(value: string): ArticleTheme | null {
  if ((HOME_THEMES as readonly string[]).includes(value)) {
    return value as ArticleTheme;
  }
  return null;
}

export function slotScheduleLabel(slot: ArticleSlot): string {
  return `${slot}:00公開予定`;
}

export function formatIsoDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match?.[1] || !match[2] || !match[3]) {
    return isoDate;
  }
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}

export function todayInJst(now: Date): string {
  return jstDate(now);
}

function isSlot(value: string): value is ArticleSlot {
  return (ARTICLE_SLOTS as readonly string[]).includes(value);
}

/**
 * その日の4枠。公開済みが最優先で、見送り、未公開の順。
 * 公開済みが複数あっても、publishedAt が新しい方を出す。
 */
export function buildDaySlots(input: {
  date: string;
  articles: readonly ListingArticle[];
  skips: readonly SlotSkip[];
}): DaySlot[] {
  const published = new Map<ArticleSlot, ListingArticle>();
  for (const article of input.articles) {
    if (article.date !== input.date || !isSlot(article.slot)) {
      continue;
    }
    const current = published.get(article.slot);
    if (!current || article.publishedAt > current.publishedAt) {
      published.set(article.slot, article);
    }
  }

  const skipped = new Set<ArticleSlot>();
  for (const skip of input.skips) {
    if (skip.date === input.date && isSlot(skip.slot)) {
      skipped.add(skip.slot);
    }
  }

  return ARTICLE_SLOTS.map((slot) => {
    const article = published.get(slot);
    if (article) {
      return {
        slot,
        state: "published",
        slug: article.slug,
        title: article.title,
        themeLabel: themeName(article.theme),
        href: `/articles/${article.slug}`,
      };
    }
    if (skipped.has(slot)) {
      return { slot, state: "skipped", label: SKIPPED_LABEL };
    }
    return { slot, state: "scheduled", label: slotScheduleLabel(slot) };
  });
}

export function themeSections(
  groups: Readonly<Record<ArticleTheme, readonly ListingArticle[]>>,
): ThemeSection[] {
  return HOME_THEMES.map((theme) => ({
    theme,
    label: themeName(theme),
    href: `/${theme}`,
    articles: groups[theme].slice(0, HOME_THEME_LIMIT),
  }));
}

/** 空や未指定は1ページ。正の整数以外は受け付けない。 */
export function parsePageParam(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return 1;
  }
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const page = Number(value);
  if (!Number.isSafeInteger(page)) {
    return null;
  }
  return page;
}

export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) {
    return 1;
  }
  return Math.ceil(total / pageSize);
}

export function themePageHref(theme: ArticleTheme, page: number): string {
  if (page <= 1) {
    return `/${theme}`;
  }
  return `/${theme}?page=${page}`;
}
