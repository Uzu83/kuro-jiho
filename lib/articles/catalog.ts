import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleTheme } from "@/lib/article-schema";
import { ARTICLE_SLOTS } from "@/lib/article-schema";
import type { ListingArticle, SlotSkip } from "@/lib/articles/board";
import type { Database } from "@/lib/database.types";
import { calendarDate } from "@/lib/kuro/dates";

type Client = SupabaseClient<Database>;

const ARTICLE_COLUMNS = "slug, title, theme, slot, date, published_at" as const;

type ArticleListRow = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  published_at: string | null;
};

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

export function toListingArticle(row: ArticleListRow): ListingArticle | null {
  const date = calendarDate(row.date);
  const title = row.title.trim();
  if (!date || title.length === 0 || row.slug.length === 0 || !row.published_at) {
    return null;
  }
  if (!(ARTICLE_SLOTS as readonly string[]).includes(row.slot)) {
    return null;
  }

  return {
    slug: row.slug,
    title,
    theme: row.theme,
    slot: row.slot,
    date,
    publishedAt: row.published_at,
  };
}

function listings(rows: readonly ArticleListRow[] | null): ListingArticle[] {
  const articles: ListingArticle[] = [];
  for (const row of rows ?? []) {
    const article = toListingArticle(row);
    if (article) {
      articles.push(article);
    }
  }
  return articles;
}

export type ArticleCatalog = {
  listPublishedOn(date: string): Promise<ListingArticle[]>;
  listSkippedOn(date: string): Promise<SlotSkip[]>;
  listNewestByTheme(theme: ArticleTheme, limit: number): Promise<ListingArticle[]>;
  listThemePage(
    theme: ArticleTheme,
    page: number,
    pageSize: number,
  ): Promise<{ articles: ListingArticle[]; total: number }>;
};

export function createArticleCatalog(client: Client): ArticleCatalog {
  return {
    async listPublishedOn(date) {
      const { data, error } = await client
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("status", "published")
        .eq("date", date)
        .order("slot", { ascending: true });
      if (error) {
        fail();
      }
      return listings(data);
    },

    async listSkippedOn(date) {
      const { data, error } = await client
        .from("slot_logs")
        .select("date, slot, status")
        .eq("date", date)
        .eq("status", "skipped");
      if (error) {
        fail();
      }

      const skips: SlotSkip[] = [];
      for (const row of data ?? []) {
        const day = calendarDate(row.date);
        if (!day || !(ARTICLE_SLOTS as readonly string[]).includes(row.slot) || row.status !== "skipped") {
          continue;
        }
        skips.push({ date: day, slot: row.slot });
      }
      return skips;
    },

    async listNewestByTheme(theme, limit) {
      const { data, error } = await client
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("status", "published")
        .eq("theme", theme)
        .order("date", { ascending: false })
        .order("slot", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) {
        fail();
      }
      return listings(data);
    },

    async listThemePage(theme, page, pageSize) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await client
        .from("articles")
        .select(ARTICLE_COLUMNS, { count: "exact" })
        .eq("status", "published")
        .eq("theme", theme)
        .order("date", { ascending: false })
        .order("slot", { ascending: false })
        .order("published_at", { ascending: false })
        .range(from, to);
      if (error) {
        fail();
      }
      return { articles: listings(data), total: count ?? 0 };
    },
  };
}
