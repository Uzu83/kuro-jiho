import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { ARTICLE_THEMES } from "@/lib/article-schema";

/** 記事ページと一覧が共有するキャッシュタグ。 */
export const ARTICLE_CACHE_TAG = "articles";

export type ArticleSurface = {
  slug: string;
  theme: string;
  date: string;
  previous?: {
    slug: string;
    theme: string;
    date: string;
  };
};

/**
 * 記事ページ、トップ、テーマ一覧、アーカイブ、フィードを無効化する。
 * expire: 0 なので、次の表示は古いキャッシュを返さず読み直す。
 */
export function revalidateArticleSurfaces(surface: ArticleSurface): void {
  const paths = new Set<string>([
    "/",
    `/articles/${surface.slug}`,
    `/archive/${surface.date}`,
    "/feed.xml",
    "/sitemap.xml",
  ]);

  for (const theme of ARTICLE_THEMES) {
    paths.add(`/${theme}`);
    paths.add(`/feed/${theme}.xml`);
  }

  if (surface.previous) {
    paths.add(`/articles/${surface.previous.slug}`);
    paths.add(`/${surface.previous.theme}`);
    paths.add(`/archive/${surface.previous.date}`);
    paths.add(`/feed/${surface.previous.theme}.xml`);
  }

  for (const path of paths) {
    revalidatePath(path);
  }
  revalidateTag(ARTICLE_CACHE_TAG, { expire: 0 });
}

export function revalidateSkipSurfaces(date: string): void {
  revalidatePath("/");
  revalidatePath(`/archive/${date}`);
  revalidateTag(ARTICLE_CACHE_TAG, { expire: 0 });
}
