import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ARTICLE_CACHE_TAG } from "@/lib/kuro/revalidate";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";

/**
 * 公開記事ページの ISR。投稿 API の revalidateTag / revalidatePath と揃える。
 * 1 時間。オンデマンド更新は ARTICLE_CACHE_TAG を expire: 0 で落とす。
 */
export const ARTICLE_PAGE_REVALIDATE_SECONDS = 60 * 60;

type CachedRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

function cachedPublicFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const nextInit: CachedRequestInit = {
    ...init,
    next: {
      revalidate: ARTICLE_PAGE_REVALIDATE_SECONDS,
      tags: [ARTICLE_CACHE_TAG],
    },
  };
  return fetch(input, nextInit);
}

/**
 * 公開読み取り専用。Cookie を付けないので記事ページを ISR にできる。
 * RLS の anon は公開済み記事と、その訂正だけを読む。
 * 環境変数が無い、または不正なときは null。ビルドはここで止めない。
 */
export function tryCreateAnonServerClient(): SupabaseClient<Database> | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const { url, anonKey } = getPublicSupabaseEnv();
    return createClient<Database>(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: cachedPublicFetch,
      },
    });
  } catch {
    return null;
  }
}
