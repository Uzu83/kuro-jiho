import "server-only";

import { cache } from "react";
import { readPublishedArticle } from "@/lib/articles/read";
import { createArticleDirectory } from "@/lib/articles/directory";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

/** リクエスト内では1回だけ読む。データ側の寿命は anon クライアントの fetch キャッシュ。 */
export const loadPublishedArticle = cache(async (slug: string) => {
  const client = tryCreateAnonServerClient();
  if (!client) {
    return null;
  }

  return readPublishedArticle(slug, createArticleDirectory(client), {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  });
});
