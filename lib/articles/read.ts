import { ARTICLE_SLUG_PATTERN } from "@/lib/article-schema";
import {
  relatedSlugs,
  toPublicArticle,
  type CorrectionRow,
  type PublicArticle,
  type PublishedArticleRow,
  type RelatedRow,
} from "@/lib/articles/public";

export type ArticleDirectory = {
  findPublished(slug: string): Promise<PublishedArticleRow | null>;
  listCorrections(articleId: string): Promise<CorrectionRow[]>;
  listPublishedRelated(slugs: string[]): Promise<RelatedRow[]>;
};

/**
 * 公開済みだけをページモデルにする。下書き・非公開・不明な slug は null。
 * 取得そのものが失敗したときは null にせず、呼び出し元の例外をそのまま返す。
 */
export async function readPublishedArticle(
  slug: string,
  directory: ArticleDirectory,
  options: { siteUrl?: string | null } = {},
): Promise<PublicArticle | null> {
  if (!ARTICLE_SLUG_PATTERN.test(slug)) {
    return null;
  }

  const row = await directory.findPublished(slug);
  if (!row || row.status !== "published" || row.slug !== slug) {
    return null;
  }

  const slugs = relatedSlugs(row.related, row.slug);
  const [corrections, related] = await Promise.all([
    directory.listCorrections(row.id),
    directory.listPublishedRelated(slugs),
  ]);

  return toPublicArticle({
    row,
    corrections,
    related,
    siteUrl: options.siteUrl ?? null,
  });
}
