import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleTheme } from "@/lib/article-kinds";
import { selectFeedEntries, type FeedEntry, type FeedSource } from "@/lib/seo/feed";
import type { Database } from "@/lib/database.types";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

type Client = SupabaseClient<Database>;

const FEED_COLUMNS = "slug, title, theme, status, published_at, summary" as const;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type FeedRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "slug" | "title" | "theme" | "status" | "published_at" | "summary"
>;

function isUnsatisfiableRange(error: unknown, status: number | undefined): boolean {
  if (status === 416) {
    return true;
  }
  return typeof error === "object" && error !== null && "code" in error && error.code === "PGRST103";
}

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

function toSource(row: FeedRow): FeedSource {
  return {
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    status: row.status,
    publishedAt: row.published_at,
    summary: row.summary,
  };
}

/** 公開済みだけを新しい順に読む。下書きと非公開は問い合わせない。 */
export async function listPublishedFeed(client: Client, theme?: ArticleTheme): Promise<FeedEntry[]> {
  const rows: FeedSource[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = client.from("articles").select(FEED_COLUMNS).eq("status", "published");
    if (theme) {
      query = query.eq("theme", theme);
    }

    const { data, error, status } = await query
      .order("published_at", { ascending: false })
      .order("slug", { ascending: false })
      .range(from, to);
    if (isUnsatisfiableRange(error, status)) {
      break;
    }
    if (error) {
      fail();
    }

    const batch = data ?? [];
    for (const row of batch) {
      if (row.status === "published") {
        rows.push(toSource(row));
      }
    }
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return selectFeedEntries(rows, theme);
}

export async function loadPublishedFeed(theme?: ArticleTheme): Promise<FeedEntry[]> {
  const client = tryCreateAnonServerClient();
  if (!client) {
    return [];
  }
  return listPublishedFeed(client, theme);
}
