import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionArticleInput, CorrectionDirectory, CorrectionNoteInput } from "@/lib/corrections/model";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

const NOTE_COLUMNS = "article_id, created_at, note, version" as const;
const ARTICLE_COLUMNS = "id, slug, title, theme, status" as const;

/** PostgREST の既定上限。これを超える訂正は、同じ順の次のページを取る。 */
export const CORRECTION_PAGE_SIZE = 1000;
const MAX_CORRECTION_PAGES = 100;
const ARTICLE_ID_CHUNK = 100;

type DirectoryOptions = {
  pageSize?: number;
  maxPages?: number;
  articleChunkSize?: number;
};

type NoteRow = Pick<
  Database["public"]["Views"]["article_corrections"]["Row"],
  "article_id" | "created_at" | "note" | "version"
>;

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "slug" | "title" | "theme" | "status"
>;

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

function asNote(row: NoteRow): CorrectionNoteInput | null {
  if (!row.article_id || !row.created_at || !Number.isInteger(row.version)) {
    return null;
  }
  return {
    articleId: row.article_id,
    createdAt: row.created_at,
    note: row.note,
    version: row.version,
  };
}

function asArticle(row: ArticleRow): CorrectionArticleInput | null {
  if (!row.id || !row.slug || !row.title || !row.theme || row.status !== "published") {
    return null;
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    status: row.status,
  };
}

/**
 * 訂正一覧。anon クライアント専用。
 * 公開ビューの訂正と、公開済み記事の見出しだけを読む。
 * 訂正は created_at、version、id の順でページを最後まで取る。上限で静かに切らない。
 * 失敗したときは、途中までの一覧を返さず、データベースのメッセージも返さない。
 */
export function createCorrectionDirectory(client: Client, options: DirectoryOptions = {}): CorrectionDirectory {
  const pageSize = options.pageSize ?? CORRECTION_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_CORRECTION_PAGES;
  const articleChunkSize = options.articleChunkSize ?? ARTICLE_ID_CHUNK;

  return {
    async listCorrectionRows() {
      if (
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        !Number.isInteger(maxPages) ||
        maxPages < 1 ||
        !Number.isInteger(articleChunkSize) ||
        articleChunkSize < 1
      ) {
        fail();
      }

      const notes: CorrectionNoteInput[] = [];
      let finished = false;
      for (let page = 0; page <= maxPages; page += 1) {
        const from = page * pageSize;
        const { data, error } = await client
          .from("article_corrections")
          .select(NOTE_COLUMNS)
          .order("created_at", { ascending: false })
          .order("version", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) {
          fail();
        }

        const rows = data ?? [];
        for (const row of rows) {
          const note = asNote(row);
          if (note) {
            notes.push(note);
          }
        }
        if (rows.length < pageSize) {
          finished = true;
          break;
        }
      }
      if (!finished) {
        fail();
      }
      if (notes.length === 0) {
        return { notes, articles: [] };
      }

      const ids = [...new Set(notes.map((note) => note.articleId))];
      const articles: CorrectionArticleInput[] = [];
      for (let index = 0; index < ids.length; index += articleChunkSize) {
        const chunk = ids.slice(index, index + articleChunkSize);
        const { data, error } = await client
          .from("articles")
          .select(ARTICLE_COLUMNS)
          .in("id", chunk)
          .eq("status", "published");
        if (error) {
          fail();
        }
        for (const row of data ?? []) {
          const article = asArticle(row);
          if (article) {
            articles.push(article);
          }
        }
      }
      return { notes, articles };
    },
  };
}
