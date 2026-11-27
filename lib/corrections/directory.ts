import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectionArticleInput, CorrectionDirectory, CorrectionNoteInput } from "@/lib/corrections/model";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

const NOTE_COLUMNS = "article_id, created_at, note, version" as const;
const ARTICLE_COLUMNS = "id, slug, title, theme, status" as const;

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
 * 公開ビューの訂正と、公開済み記事の見出しだけを読む。失敗時はデータベースのメッセージを返さない。
 */
export function createCorrectionDirectory(client: Client): CorrectionDirectory {
  return {
    async listCorrectionRows() {
      const { data: noteData, error: noteError } = await client
        .from("article_corrections")
        .select(NOTE_COLUMNS)
        .order("created_at", { ascending: false })
        .order("version", { ascending: false });
      if (noteError) {
        fail();
      }

      const notes: CorrectionNoteInput[] = [];
      for (const row of noteData ?? []) {
        const note = asNote(row);
        if (note) {
          notes.push(note);
        }
      }
      if (notes.length === 0) {
        return { notes, articles: [] };
      }

      const ids = [...new Set(notes.map((note) => note.articleId))];
      const { data: articleData, error: articleError } = await client
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .in("id", ids)
        .eq("status", "published");
      if (articleError) {
        fail();
      }

      const articles: CorrectionArticleInput[] = [];
      for (const row of articleData ?? []) {
        const article = asArticle(row);
        if (article) {
          articles.push(article);
        }
      }
      return { notes, articles };
    },
  };
}
