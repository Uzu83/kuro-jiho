import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleAnalytics } from "@/app/articles/[slug]/article-analytics";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { loadPublishedArticle } from "@/lib/articles/load";
import { newsArticleJsonLd, serializeJsonLd } from "@/lib/seo/news-article";
import { formatJstTimestamp } from "@/lib/seo/time";
import { resolveSiteOrigin } from "@/lib/site/origin";

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

  const origin = resolveSiteOrigin();
  const description = article.summary.join(" ");
  const publishedTime = formatJstTimestamp(article.publishedAt) ?? undefined;
  const modifiedTime = formatJstTimestamp(article.updatedAt) ?? undefined;

  return {
    title: `${article.title}｜クロの時報`,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      locale: "ja_JP",
      siteName: "クロの時報",
      url: `${origin}/articles/${article.slug}`,
      publishedTime,
      modifiedTime,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    notFound();
  }

  const jsonLd = newsArticleJsonLd(article, resolveSiteOrigin());

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      ) : null}
      <ArticleAnalytics theme={article.theme} slot={article.slot} slug={article.slug}>
        <ArticleDocument article={article} />
      </ArticleAnalytics>
    </>
  );
}
