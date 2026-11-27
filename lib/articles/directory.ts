import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleDirectory } from "@/lib/articles/read";
import type { CorrectionRow, PublishedArticleRow, RelatedRow } from "@/lib/articles/public";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type SelectedArticle = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  | "id"
  | "slug"
  | "title"
  | "theme"
  | "slot"
  | "status"
  | "published_at"
  | "updated_at"
  | "summary"
  | "body_md"
  | "sources"
  | "verification"
  | "related"
>;

function fail(): never {
  throw new Error("記事の取得に失敗しました");
}

function asPublished(row: SelectedArticle): PublishedArticleRow | null {
  if (row.status !== "published") {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    slot: row.slot,
    status: row.status,
    published_at: row.published_at,
    updated_at: row.updated_at,
    summary: row.summary,
    body_md: row.body_md,
    sources: row.sources,
    verification: row.verification,
    related: row.related,
  };
}

export function createArticleDirectory(client: Client): ArticleDirectory {
  return {
    async findPublished(slug) {
      const { data, error } = await client
        .from("articles")
        .select(
          "id, slug, title, theme, slot, status, published_at, updated_at, summary, body_md, sources, verification, related",
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error || !data) {
        if (error) {
          fail();
        }
        return null;
      }
      return asPublished(data);
    },

    async listCorrections(articleId) {
      const { data, error } = await client
        .from("article_corrections")
        .select("id, created_at, note, version")
        .eq("article_id", articleId)
        .order("created_at", { ascending: false })
        .order("version", { ascending: false });
      if (error) {
        fail();
      }

      return (data ?? []).map(
        (row): CorrectionRow => ({
          id: row.id,
          created_at: row.created_at,
          note: row.note,
          version: row.version,
        }),
      );
    },

    async listPublishedRelated(slugs) {
      if (slugs.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from("articles")
        .select("slug, title, status")
        .in("slug", slugs)
        .eq("status", "published");
      if (error) {
        fail();
      }

      return (data ?? [])
        .filter((row) => row.status === "published")
        .map(
          (row): RelatedRow => ({
            slug: row.slug,
            title: row.title,
            status: row.status,
          }),
        );
    },
  };
}
