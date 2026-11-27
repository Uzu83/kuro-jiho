import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleDocument } from "@/app/articles/[slug]/article-document";
import { loadPublishedArticle } from "@/lib/articles/load";
import { articlePublicUrl } from "@/lib/articles/public";
import { formatJstOffset } from "@/lib/seo/dates";
import { jsonLdScript, newsArticleData } from "@/lib/seo/news-article";
import { siteOrigin } from "@/lib/seo/public-url";

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

  const origin = siteOrigin();
  const canonical = articlePublicUrl(article.slug, origin);
  const description = article.summary.join(" ");
  const publishedTime = formatJstOffset(article.publishedAt);
  const modifiedTime = formatJstOffset(article.updatedAt);

  return {
    title: `${article.title}｜クロの時報`,
    description,
    alternates: { canonical },
    openGraph: {
      title: article.title,
      description,
      type: "article",
      url: canonical,
      locale: "ja_JP",
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    notFound();
  }

  const data = newsArticleData(article, siteOrigin());

  return (
    <>
      {data ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ) : null}
      <ArticleDocument article={article} />
    </>
  );
}
