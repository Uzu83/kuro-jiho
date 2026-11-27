import { readFile } from "node:fs/promises";
import path from "node:path";
import { OG_AI_LABEL, OG_FONT_FAMILY, OG_IMAGE } from "@/lib/seo/og-mark";

/** Noto Sans JP（SIL Open Font License 1.1）。本文は assets/fonts/OFL.txt。 */
const FONT_PATH = path.join(process.cwd(), "assets/fonts/NotoSansJP-Medium.woff");

let fontData: Promise<ArrayBuffer> | null = null;

export function loadOgFont(): Promise<ArrayBuffer> {
  fontData ??= readFile(FONT_PATH).then((font) => {
    return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer;
  });
  return fontData;
}

/** 文字だけ。タイトル、テーマ、「AIが作成」。 */
export function ogCard(input: { themeLabel: string; title: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f7f4ee",
        color: "#1c1915",
        padding: "72px",
        fontFamily: OG_FONT_FAMILY,
        fontWeight: 500,
      }}
    >
      <div style={{ display: "flex", color: "#8c2f2f", fontSize: 28, letterSpacing: "0.14em" }}>{input.themeLabel}</div>
      <div style={{ display: "flex", fontSize: 52, lineHeight: 1.35, width: "1056px" }}>{input.title}</div>
      <div style={{ display: "flex", fontSize: 32 }}>{OG_AI_LABEL}</div>
    </div>
  );
}

export const ogImageOptions = OG_IMAGE;
