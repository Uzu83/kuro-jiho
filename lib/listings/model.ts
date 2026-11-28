import {
  ARTICLE_SLOTS,
  ARTICLE_THEMES,
  type ArticleSlot,
  type ArticleTheme,
} from "@/lib/article-schema";
import { formatCalendarDate, isIsoDate, jstDate } from "@/lib/kuro/dates";
import { themeLabel } from "@/lib/articles/public";

/** トップのテーマ欄とナビの順。パスは /sports から。 */
export const LISTING_THEMES = ["sports", "fukuoka", "it", "gadget", "f1"] as const satisfies readonly ArticleTheme[];

export const HOME_THEME_LIMIT = 5;
export const THEME_PAGE_SIZE = 10;

export const SKIPPED_SLOT_LABEL = "この枠は見送りました";

const SLOT_CLOCK: Record<ArticleSlot, string> = {
  "07": "7時",
  "12": "12時",
  "17": "17時",
  "20": "20時",
};

export type ListingArticle = {
  slug: string;
  title: string;
  theme: ArticleTheme;
  slot: ArticleSlot;
  date: string;
  publishedAt: string;
  summary: string;
};

export type SlotSkip = {
  date: string;
  slot: ArticleSlot;
  status: "skipped";
};

export type DaySlot =
  | {
      slot: ArticleSlot;
      timeLabel: string;
      kind: "published";
      article: ListingArticle;
    }
  | {
      slot: ArticleSlot;
      timeLabel: string;
      kind: "scheduled";
      label: string;
    }
  | {
      slot: ArticleSlot;
      timeLabel: string;
      kind: "skipped";
      label: typeof SKIPPED_SLOT_LABEL;
    };

export type ThemeGroup = {
  theme: ArticleTheme;
  label: string;
  articles: ListingArticle[];
};

export type HomeModel = {
  date: string;
  dateLabel: string;
  slots: DaySlot[];
  themes: ThemeGroup[];
};

export type ThemeModel = {
  theme: ArticleTheme;
  label: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  articles: ListingArticle[];
  outOfRange: boolean;
};

export type ArchiveModel = {
  date: string;
  dateLabel: string;
  slots: DaySlot[];
};

export type ListingDirectory = {
  listPublishedOnDate(date: string): Promise<ListingArticle[]>;
  listSkipsOnDate(date: string): Promise<SlotSkip[]>;
  listNewestByTheme(theme: ArticleTheme, limit: number): Promise<ListingArticle[]>;
  listThemePage(
    theme: ArticleTheme,
    page: number,
    pageSize: number,
  ): Promise<{ articles: ListingArticle[]; total: number }>;
};

const emptyDirectory: ListingDirectory = {
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
};

export function slotClock(slot: ArticleSlot): string {
  return SLOT_CLOCK[slot];
}

export function scheduledSlotLabel(slot: ArticleSlot): string {
  return `${slotClock(slot)}公開予定`;
}

export function isArticleTheme(value: string): value is ArticleTheme {
  return (ARTICLE_THEMES as readonly string[]).includes(value);
}

export function isArticleSlot(value: string): value is ArticleSlot {
  return (ARTICLE_SLOTS as readonly string[]).includes(value);
}

export function parseThemeParam(value: string): ArticleTheme | null {
  return isArticleTheme(value) ? value : null;
}

/** 空は 1 ページ。0、小数、記号は受け付けない。 */
export function parsePageParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") {
    return 1;
  }
  if (!/^[1-9][0-9]{0,5}$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

export function parseArchiveDate(value: string): string | null {
  return isIsoDate(value) ? value : null;
}

export function themePageHref(theme: ArticleTheme, page: number): string {
  return page <= 1 ? `/${theme}` : `/${theme}/page/${page}`;
}

function byNewest(a: ListingArticle, b: ListingArticle): number {
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

export function sortNewest(articles: readonly ListingArticle[]): ListingArticle[] {
  return [...articles].sort(byNewest);
}

/**
 * その日の4枠。公開済みを優先し、無ければ見送り、どちらも無ければ公開予定。
 * 渡された配列に別の日や別の枠が混ざっていても、その枠には使わない。
 */
export function buildDaySlots(input: {
  date: string;
  articles: readonly ListingArticle[];
  skips: readonly SlotSkip[];
}): DaySlot[] {
  return ARTICLE_SLOTS.map((slot) => {
    const timeLabel = slotClock(slot);
    const article = sortNewest(
      input.articles.filter((item) => item.date === input.date && item.slot === slot),
    )[0];
    if (article) {
      return { slot, timeLabel, kind: "published", article };
    }

    const skipped = input.skips.some(
      (item) => item.date === input.date && item.slot === slot && item.status === "skipped",
    );
    if (skipped) {
      return { slot, timeLabel, kind: "skipped", label: SKIPPED_SLOT_LABEL };
    }

    return { slot, timeLabel, kind: "scheduled", label: scheduledSlotLabel(slot) };
  });
}

export function takeNewest(
  articles: readonly ListingArticle[],
  theme: ArticleTheme,
  limit: number,
): ListingArticle[] {
  return sortNewest(articles.filter((article) => article.theme === theme)).slice(0, limit);
}

export function selectThemePage(
  articles: readonly ListingArticle[],
  theme: ArticleTheme,
  page: number,
  pageSize: number,
): { articles: ListingArticle[]; total: number } {
  const filtered = sortNewest(articles.filter((article) => article.theme === theme));
  const start = (page - 1) * pageSize;
  return {
    articles: filtered.slice(start, start + pageSize),
    total: filtered.length,
  };
}

function directoryOrEmpty(directory: ListingDirectory | null): ListingDirectory {
  return directory ?? emptyDirectory;
}

export async function readHome(directory: ListingDirectory | null, now: Date): Promise<HomeModel> {
  const source = directoryOrEmpty(directory);
  const date = jstDate(now);
  const [articles, skips, themeArticles] = await Promise.all([
    source.listPublishedOnDate(date),
    source.listSkipsOnDate(date),
    Promise.all(LISTING_THEMES.map((theme) => source.listNewestByTheme(theme, HOME_THEME_LIMIT))),
  ]);

  return {
    date,
    dateLabel: formatCalendarDate(date),
    slots: buildDaySlots({ date, articles, skips }),
    themes: LISTING_THEMES.map((theme, index) => ({
      theme,
      label: themeLabel(theme),
      articles: takeNewest(themeArticles[index] ?? [], theme, HOME_THEME_LIMIT),
    })),
  };
}

export async function readTheme(
  directory: ListingDirectory | null,
  theme: ArticleTheme,
  page: number,
): Promise<ThemeModel> {
  const { articles, total } = await directoryOrEmpty(directory).listThemePage(theme, page, THEME_PAGE_SIZE);
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / THEME_PAGE_SIZE));

  return {
    theme,
    label: themeLabel(theme),
    page,
    pageSize: THEME_PAGE_SIZE,
    total: safeTotal,
    totalPages,
    articles: articles.filter((article) => article.theme === theme),
    outOfRange: page > totalPages || (safeTotal === 0 && page > 1),
  };
}

export async function readArchive(
  directory: ListingDirectory | null,
  date: string,
): Promise<ArchiveModel | null> {
  const parsed = parseArchiveDate(date);
  if (!parsed) {
    return null;
  }

  const source = directoryOrEmpty(directory);
  const [articles, skips] = await Promise.all([
    source.listPublishedOnDate(parsed),
    source.listSkipsOnDate(parsed),
  ]);

  return {
    date: parsed,
    dateLabel: formatCalendarDate(parsed),
    slots: buildDaySlots({ date: parsed, articles, skips }),
  };
}
