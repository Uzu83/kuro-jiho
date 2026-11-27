import "server-only";

import { ARTICLE_SLOTS, ARTICLE_STATUSES, ARTICLE_THEMES } from "@/lib/article-schema";
import { isoDate } from "@/lib/kuro/store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { EditableArticle } from "@/lib/admin/submit";
import { statusLabel } from "@/lib/admin/revisions";

export type AdminFilters = {
  status: string | null;
  date: string | null;
  slot: string | null;
  theme: string | null;
};

export type AdminListItem = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
};

export type AdminSlotItem = {
  slot: string;
  timeLabel: string;
  label: string;
  title: string | null;
  slug: string | null;
};

const SLOT_CLOCK: Record<string, string> = {
  "07": "7:00",
  "12": "12:00",
  "17": "17:00",
  "20": "20:00",
};

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}

export function parseAdminFilters(params: Record<string, string | string[] | undefined>): AdminFilters {
  const status = one(params.status);
  const date = one(params.date);
  const slot = one(params.slot);
  const theme = one(params.theme);

  return {
    status: (ARTICLE_STATUSES as readonly string[]).includes(status) ? status : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    slot: (ARTICLE_SLOTS as readonly string[]).includes(slot) ? slot : null,
    theme: (ARTICLE_THEMES as readonly string[]).includes(theme) ? theme : null,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return [];
  }
  return value;
}

export function buildAdminSlots(input: {
  articles: readonly { slug: string; title: string; slot: string; status: string }[];
  skips: readonly { slot: string }[];
}): AdminSlotItem[] {
  const rank: Record<string, number> = { published: 3, draft: 2, unpublished: 1 };

  return ARTICLE_SLOTS.map((slot) => {
    const matches = input.articles
      .filter((article) => article.slot === slot)
      .sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0));
    const article = matches[0];
    if (article) {
      return {
        slot,
        timeLabel: SLOT_CLOCK[slot] ?? slot,
        label: statusLabel(article.status),
        title: article.title,
        slug: article.slug,
      };
    }

    if (input.skips.some((skip) => skip.slot === slot)) {
      return {
        slot,
        timeLabel: SLOT_CLOCK[slot] ?? slot,
        label: "この枠は見送りました",
        title: null,
        slug: null,
      };
    }

    return {
      slot,
      timeLabel: SLOT_CLOCK[slot] ?? slot,
      label: "まだありません",
      title: null,
      slug: null,
    };
  });
}

export async function listAdminArticles(filters: AdminFilters): Promise<AdminListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("articles")
    .select("slug, title, theme, slot, date, status")
    .order("date", { ascending: false })
    .order("slot", { ascending: false })
    .limit(100);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.date) {
    query = query.eq("date", filters.date);
  }
  if (filters.slot) {
    query = query.eq("slot", filters.slot);
  }
  if (filters.theme) {
    query = query.eq("theme", filters.theme);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("admin list failed");
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    slot: row.slot,
    date: isoDate(row.date),
    status: row.status,
  }));
}

export async function listTodayArticles(date: string): Promise<AdminListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select("slug, title, theme, slot, date, status")
    .eq("date", date);

  if (error) {
    throw new Error("admin today failed");
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    slot: row.slot,
    date: isoDate(row.date),
    status: row.status,
  }));
}

export async function listTodaySkips(date: string): Promise<{ slot: string }[]> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("slot_logs")
      .select("slot, status")
      .eq("date", date)
      .eq("status", "skipped");

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({ slot: row.slot }));
  } catch {
    return [];
  }
}

export async function loadEditable(slug: string): Promise<EditableArticle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select(
      "id, slug, title, theme, slot, date, status, published_at, summary, body_md, sources, verification, related",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error("admin article failed");
  }
  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    theme: data.theme,
    slot: data.slot,
    date: isoDate(data.date),
    status: data.status,
    published_at: data.published_at,
    body_md: data.body_md,
    summary: asStringArray(data.summary),
    sources: data.sources,
    verification: data.verification,
    related: asStringArray(data.related),
  };
}

export async function loadRevisionRows(articleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("article_revisions")
    .select("id, version, snapshot, change_type, note, actor, created_at")
    .eq("article_id", articleId)
    .order("version", { ascending: true });

  if (error) {
    throw new Error("admin revisions failed");
  }

  return data ?? [];
}
