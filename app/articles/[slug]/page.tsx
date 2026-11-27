import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { loadPublishedArticle } from "@/lib/articles/load";

export const revalidate = 3600;

/** ビルド時には記事を作らない。初回アクセスで ISR し、1 時間と #4 の revalidate で更新する。 */
export function generateStaticParams() {
  return [];
}

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    return { title: "記事が見つかりません｜クロの時報" };
  }

  return {
    title: `${article.title}｜クロの時報`,
    description: article.summary.join(" "),
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    notFound();
  }

  return <ArticleDocument article={article} />;
}
