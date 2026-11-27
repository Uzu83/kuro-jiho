import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleTheme } from "@/lib/article-schema";
import type { Database } from "@/lib/database.types";
import { isArticleTheme } from "@/lib/listings/model";
import { publishedFeedArticles, type FeedArticle, type FeedArticleRow } from "@/lib/seo/feed";

type Client = SupabaseClient<Database>;

/** 本文、出典、著者は取らない。公開済みの見出しと要約だけ。 */
export const FEED_COLUMNS = "slug, title, theme, slot, date, status, published_at, updated_at, summary" as const;

/** PostgREST の既定上限。これを超える公開記事は、同じ順の次のページを取る。 */
export const FEED_PAGE_SIZE = 1000;
const MAX_FEED_PAGES = 100;

type DirectoryOptions = {
  pageSize?: number;
  maxPages?: number;
};

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

/**
 * 公開フィード。anon クライアント専用。
 * status=published で読み、行でもう一度公開済みだけに絞る。
 * ページの終わりが確認できないときは、途中の一覧を返さない。
 */
export function createFeedDirectory(client: Client, options: DirectoryOptions = {}) {
  const pageSize = options.pageSize ?? FEED_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_FEED_PAGES;

  return {
    async listPublished(theme: ArticleTheme | null): Promise<FeedArticle[]> {
      if (
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        !Number.isInteger(maxPages) ||
        maxPages < 1 ||
        (theme !== null && !isArticleTheme(theme))
      ) {
        fail();
      }

      const rows: FeedArticleRow[] = [];
      let finished = false;
      for (let page = 0; page <= maxPages; page += 1) {
        const from = page * pageSize;
        let query = client
          .from("articles")
          .select(FEED_COLUMNS)
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .order("slug", { ascending: false });
        if (theme) {
          query = query.eq("theme", theme);
        }
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) {
          fail();
        }
        rows.push(...((data ?? []) as FeedArticleRow[]));
        if ((data ?? []).length < pageSize) {
          finished = true;
          break;
        }
      }
      if (!finished) {
        fail();
      }
      return publishedFeedArticles(rows, theme);
    },
  };
}
