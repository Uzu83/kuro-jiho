import "server-only";

import { cache } from "react";
import type { ArticleTheme } from "@/lib/article-schema";
import { createFeedDirectory } from "@/lib/seo/directory";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

/** 環境変数が無いときは空。ビルドはここで止めない。 */
export const loadPublishedFeed = cache(async (theme: ArticleTheme | null) => {
  const client = tryCreateAnonServerClient();
  if (!client) {
    return [];
  }
  return createFeedDirectory(client).listPublished(theme);
});
