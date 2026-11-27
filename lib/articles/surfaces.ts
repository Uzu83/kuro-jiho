import "server-only";

import {
  buildDaySlots,
  HOME_THEME_LIMIT,
  HOME_THEMES,
  themeName,
  themeSections,
  todayInJst,
  type DaySlot,
  type ListingArticle,
  type ThemeSection,
} from "@/lib/articles/board";
import { createArticleCatalog, type ArticleCatalog } from "@/lib/articles/catalog";
import type { ArticleTheme } from "@/lib/article-schema";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

export type HomeSurface = {
  today: string;
  slots: DaySlot[];
  themes: ThemeSection[];
};

function openCatalog(): ArticleCatalog | null {
  const client = tryCreateAnonServerClient();
  if (!client) {
    return null;
  }
  return createArticleCatalog(client);
}

const emptyThemes = (): Record<ArticleTheme, ListingArticle[]> => ({
  sports: [],
  fukuoka: [],
  it: [],
  gadget: [],
  f1: [],
});

async function readDay(catalog: ArticleCatalog, date: string): Promise<DaySlot[]> {
  const [articles, skips] = await Promise.all([
    catalog.listPublishedOn(date),
    catalog.listSkippedOn(date),
  ]);
  return buildDaySlots({ date, articles, skips });
}

export async function loadHome(now: Date): Promise<HomeSurface> {
  const today = todayInJst(now);
  const catalog = openCatalog();
  if (!catalog) {
    return {
      today,
      slots: buildDaySlots({ date: today, articles: [], skips: [] }),
      themes: themeSections(emptyThemes()),
    };
  }

  const [slots, groups] = await Promise.all([
    readDay(catalog, today),
    Promise.all(HOME_THEMES.map((theme) => catalog.listNewestByTheme(theme, HOME_THEME_LIMIT))),
  ]);

  const byTheme = emptyThemes();
  HOME_THEMES.forEach((theme, index) => {
    byTheme[theme] = groups[index] ?? [];
  });

  return { today, slots, themes: themeSections(byTheme) };
}

export async function loadThemePage(
  theme: ArticleTheme,
  page: number,
  pageSize: number,
): Promise<{ label: string; articles: ListingArticle[]; total: number }> {
  const catalog = openCatalog();
  if (!catalog) {
    return { label: themeName(theme), articles: [], total: 0 };
  }

  const result = await catalog.listThemePage(theme, page, pageSize);
  return { label: themeName(theme), articles: result.articles, total: result.total };
}

export async function loadArchive(date: string): Promise<DaySlot[]> {
  const catalog = openCatalog();
  if (!catalog) {
    return buildDaySlots({ date, articles: [], skips: [] });
  }
  return readDay(catalog, date);
}
