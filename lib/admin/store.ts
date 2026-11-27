import "server-only";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  ArticleNotFoundError,
  isoDate,
  mapDatabaseError,
  type ArticlePatch,
  type ArticleWrite,
} from "@/lib/kuro/store";
import type { AdminWriteStore } from "@/lib/admin/submit";

type Saved = { slug: string; theme: string; date: string };

function fail(error: { code?: string; message?: string }): never {
  throw mapDatabaseError(error.code, error.message);
}

export function createAdminStore(): AdminWriteStore {
  return {
    async insertArticle(article: ArticleWrite): Promise<Saved> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("articles")
        .insert({
          slug: article.slug,
          title: article.title,
          theme: article.theme,
          slot: article.slot,
          date: article.date,
          status: article.status,
          published_at: article.published_at,
          summary: article.summary,
          body_md: article.body_md,
          sources: article.sources as Json,
          verification: article.verification as Json,
          related: article.related,
          ai_generated: true,
          author: "kuro",
        })
        .select("slug, theme, date")
        .single();

      if (error) {
        fail(error);
      }
      if (!data) {
        throw new Error("database request failed");
      }

      return { slug: data.slug, theme: data.theme, date: isoDate(data.date) };
    },

    async updateArticle(id, patch: ArticlePatch, revision): Promise<Saved> {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("kuro_apply_article_update", {
        target_id: id,
        patch: patch as Json,
        change_type: revision.changeType,
        change_note: revision.changeNote,
        expected_version: revision.expectedVersion,
      });

      if (error) {
        fail(error);
      }

      const row = data?.[0];
      if (!row) {
        throw new ArticleNotFoundError();
      }

      return { slug: row.slug, theme: row.theme, date: isoDate(row.date) };
    },

    async findPublishedId(date, slot) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("articles")
        .select("id")
        .eq("date", date)
        .eq("slot", slot)
        .eq("status", "published")
        .maybeSingle();

      if (error) {
        fail(error);
      }

      return data?.id ?? null;
    },
  };
}
