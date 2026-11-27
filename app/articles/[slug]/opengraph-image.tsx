import { ImageResponse } from "next/og";
import { loadPublishedArticle } from "@/lib/articles/load";
import { OG_SIZE, loadOgFont, ogCard } from "@/lib/seo/og";

export const alt = "AIが作成";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadPublishedArticle(slug);
  if (!article) {
    return new Response("Not found", { status: 404 });
  }

  const card = ogCard({ title: article.title, themeLabel: article.themeLabel });
  const font = await loadOgFont(`${card.themeLabel}${card.title}${card.badge}`);
  if (!font) {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#161411",
          color: "#f7f4ee",
          padding: "72px",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, letterSpacing: "0.12em" }}>{card.themeLabel}</div>
        <div style={{ display: "flex", fontSize: 64, lineHeight: 1.35, fontWeight: 600 }}>{card.title}</div>
        <div style={{ display: "flex", fontSize: 36 }}>{card.badge}</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Noto Sans JP", data: font, weight: 600, style: "normal" }],
    },
  );
}
