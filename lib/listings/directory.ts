import { ARTICLE_SLUG_PATTERN, type ArticleSlot, type ArticleTheme } from "@/lib/article-schema";
import type { ListingArticle, ListingDirectory, SlotSkip } from "@/lib/listings/model";
import { isArticleSlot, isArticleTheme, sortNewest } from "@/lib/listings/model";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

const ARTICLE_LIST_COLUMNS =
  "slug, title, theme, slot, date, status, published_at, summary" as const;

const SKIP_COLUMNS = "date, slot, status" as const;

type ArticleListRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "slug" | "title" | "theme" | "slot" | "date" | "status" | "published_at" | "summary"
>;

type SkipRow = Pick<Database["public"]["Views"]["slot_logs_public"]["Row"], "date" | "slot" | "status">;

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

/** PostgREST は件数を超える Range を 416 / PGRST103 にする。空配列にはならない。 */
function isUnsatisfiableRange(error: unknown, status: number | undefined): boolean {
  if (status === 416) {
    return true;
  }
  return typeof error === "object" && error !== null && "code" in error && error.code === "PGRST103";
}

function summaryLine(value: readonly string[]): string {
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const text = item.trim();
    if (text.length > 0) {
      return text;
    }
  }
  return "";
}

export function toListingArticle(row: ArticleListRow): ListingArticle | null {
  if (row.status !== "published" || !row.published_at) {
    return null;
  }
  if (!ARTICLE_SLUG_PATTERN.test(row.slug) || !isArticleTheme(row.theme) || !isArticleSlot(row.slot)) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.published_at))) {
    return null;
  }

  const title = row.title.trim();
  if (title.length === 0) {
    return null;
  }

  return {
    slug: row.slug,
    title,
    theme: row.theme,
    slot: row.slot,
    date: row.date,
    publishedAt: row.published_at,
    summary: summaryLine(row.summary),
  };
}

export function toSlotSkip(row: SkipRow): SlotSkip | null {
  if (row.status !== "skipped" || !isArticleSlot(row.slot) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    return null;
  }

  return {
    date: row.date,
    slot: row.slot as ArticleSlot,
    status: "skipped",
  };
}

function articlesFrom(rows: readonly ArticleListRow[] | null, theme?: ArticleTheme): ListingArticle[] {
  const articles: ListingArticle[] = [];
  for (const row of rows ?? []) {
    const article = toListingArticle(row);
    if (!article) {
      continue;
    }
    if (theme && article.theme !== theme) {
      continue;
    }
    articles.push(article);
  }
  return sortNewest(articles);
}

/**
 * 公開一覧。anon クライアント専用。見送りは reason を含まない view だけを読む。
 * 失敗したときはデータベースのメッセージを返さない。
 */
export function createListingDirectory(client: Client): ListingDirectory {
  async function countTheme(theme: ArticleTheme): Promise<number> {
    const { count, error } = await client
      .from("articles")
      .select("slug", { count: "exact", head: true })
      .eq("status", "published")
      .eq("theme", theme);
    if (error || typeof count !== "number") {
      fail();
    }
    return count;
  }

  return {
    async listPublishedOnDate(date) {
      const { data, error } = await client
        .from("articles")
        .select(ARTICLE_LIST_COLUMNS)
        .eq("status", "published")
        .eq("date", date)
        .order("published_at", { ascending: false })
        .order("slug", { ascending: false });
      if (error) {
        fail();
      }
      return articlesFrom(data);
    },

    async listSkipsOnDate(date) {
      const { data, error } = await client
        .from("slot_logs_public")
        .select(SKIP_COLUMNS)
        .eq("date", date);
      if (error) {
        fail();
      }

      const skips: SlotSkip[] = [];
      for (const row of data ?? []) {
        const skip = toSlotSkip(row);
        if (skip) {
          skips.push(skip);
        }
      }
      return skips;
    },

    async listNewestByTheme(theme, limit) {
      const { data, error } = await client
        .from("articles")
        .select(ARTICLE_LIST_COLUMNS)
        .eq("status", "published")
        .eq("theme", theme)
        .order("published_at", { ascending: false })
        .order("slug", { ascending: false })
        .limit(limit);
      if (error) {
        fail();
      }
      return articlesFrom(data, theme).slice(0, limit);
    },

    async listThemePage(theme, page, pageSize) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count, status } = await client
        .from("articles")
        .select(ARTICLE_LIST_COLUMNS, { count: "exact" })
        .eq("status", "published")
        .eq("theme", theme)
        .order("published_at", { ascending: false })
        .order("slug", { ascending: false })
        .range(from, to);
      if (isUnsatisfiableRange(error, status)) {
        return { articles: [], total: await countTheme(theme) };
      }
      if (error || typeof count !== "number") {
        fail();
      }
      return {
        articles: articlesFrom(data, theme),
        total: count,
      };
    },
  };
}
