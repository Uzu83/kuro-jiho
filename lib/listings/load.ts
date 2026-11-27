import "server-only";

import { cache } from "react";
import type { ArticleTheme } from "@/lib/article-schema";
import { readArchive, readHome, readTheme } from "@/lib/listings/model";
import { createListingDirectory } from "@/lib/listings/directory";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

function directory() {
  const client = tryCreateAnonServerClient();
  return client ? createListingDirectory(client) : null;
}

/** リクエスト内では1回だけ読む。データ側の寿命は anon クライアントの articles タグ。 */
export const loadHome = cache(async () => {
  return readHome(directory(), new Date());
});

export const loadTheme = cache(async (theme: ArticleTheme, page: number) => {
  return readTheme(directory(), theme, page);
});

export const loadArchive = cache(async (date: string) => {
  return readArchive(directory(), date);
});
