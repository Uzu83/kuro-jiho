import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { loadPublishedArticle } from "@/lib/articles/load";
import { OG_AI_LABEL, OG_FONT_FAMILY, OG_IMAGE } from "@/lib/seo/og-mark";
import { loadOgFont, ogCard } from "@/lib/seo/og";

export const alt = OG_AI_LABEL;
export const size = OG_IMAGE;
export const contentType = "image/png";
export const revalidate = 3600;

type ImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function OpenGraphImage({ params }: ImageProps) {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    notFound();
  }

  return new ImageResponse(ogCard({ themeLabel: article.themeLabel, title: article.title }), {
    ...size,
    fonts: [{ name: OG_FONT_FAMILY, data: await loadOgFont(), weight: 500, style: "normal" }],
  });
}
