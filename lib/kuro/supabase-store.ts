import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ArticleNotFoundError,
  isoDate,
  mapDatabaseError,
  sourceUrls,
  type ArticlePatch,
  type ArticleRecord,
  type ArticleRevision,
  type ArticleSummary,
  type ArticleWrite,
  type KuroStore,
  type SavedArticle,
  type SkipRecord,
} from "@/lib/kuro/store";

type Client = SupabaseClient<Database>;
type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return [];
  }
  return value;
}

function asRecord(row: ArticleRow): ArticleRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    slot: row.slot,
    date: isoDate(row.date),
    status: row.status,
    published_at: row.published_at,
    updated_at: row.updated_at,
    summary: asStringArray(row.summary),
    body_md: row.body_md,
    sources: row.sources,
    verification: row.verification,
    related: asStringArray(row.related),
    ai_generated: row.ai_generated,
    author: row.author,
    version: row.version,
  };
}

function savedFrom(row: Pick<ArticleRow, "slug" | "version" | "theme" | "date">): SavedArticle {
  return {
    slug: row.slug,
    version: row.version,
    theme: row.theme,
    date: isoDate(row.date),
  };
}

function throwDb(error: { code?: string; message?: string }): never {
  throw mapDatabaseError(error.code, error.message);
}

export function createSupabaseKuroStore(): KuroStore {
  let client: Client | undefined;
  const db = () => {
    client ??= createServiceClient();
    return client;
  };

  return {
    async listRecent(sinceDate) {
      const { data, error } = await db()
        .from("articles")
        .select("slug, title, theme, slot, date, status, sources")
        .gte("date", sinceDate)
        .order("date", { ascending: false })
        .order("slot", { ascending: false });
      if (error) {
        throwDb(error);
      }

      return (data ?? []).map((row): ArticleSummary => ({
        slug: row.slug,
        title: row.title,
        theme: row.theme,
        slot: row.slot,
        date: isoDate(row.date),
        status: row.status,
        source_urls: sourceUrls(row.sources),
      }));
    },

    async findBySlug(slug) {
      const { data, error } = await db()
        .from("articles")
        .select(
          "id, slug, title, theme, slot, date, status, published_at, updated_at, summary, body_md, sources, verification, related, ai_generated, author, version",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        throwDb(error);
      }
      return data ? asRecord(data) : null;
    },

    async findPublishedId(date, slot) {
      const { data, error } = await db()
        .from("articles")
        .select("id")
        .eq("date", date)
        .eq("slot", slot)
        .eq("status", "published")
        .maybeSingle();
      if (error) {
        throwDb(error);
      }
      return data?.id ?? null;
    },

    async insertArticle(article: ArticleWrite) {
      const { data, error } = await db()
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
        .select("slug, version, theme, date")
        .single();
      if (error) {
        throwDb(error);
      }
      if (!data) {
        throw new Error("database request failed");
      }
      return savedFrom(data);
    },

    async updateArticle(id: string, patch: ArticlePatch, revision: ArticleRevision) {
      const { data, error } = await db().rpc("kuro_apply_article_update", {
        target_id: id,
        patch: patch as Json,
        change_type: revision.changeType,
        change_note: revision.changeNote,
      });
      if (error) {
        throwDb(error);
      }
      const row = data?.[0];
      if (!row) {
        throw new ArticleNotFoundError();
      }
      return savedFrom(row);
    },

    async insertSkip(input): Promise<SkipRecord> {
      const { data, error } = await db()
        .from("slot_logs")
        .insert({
          date: input.date,
          slot: input.slot,
          status: "skipped",
          reason: input.reason,
        })
        .select("id, date, slot, status")
        .single();
      if (error) {
        throwDb(error);
      }
      if (!data) {
        throw new Error("database request failed");
      }
      return {
        id: data.id,
        date: isoDate(data.date),
        slot: data.slot,
        status: "skipped",
      };
    },

    async consumeRateLimit(key, limit, windowSeconds) {
      const { data, error } = await db().rpc("consume_rate_limit", {
        key,
        limit,
        window_seconds: windowSeconds,
      });
      if (error) {
        throwDb(error);
      }
      return data === true;
    },
  };
}
