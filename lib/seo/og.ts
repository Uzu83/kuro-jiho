export const OG_BADGE = "AIが作成";
export const OG_SIZE = { width: 1200, height: 630 } as const;

export type OgCard = {
  title: string;
  themeLabel: string;
  badge: typeof OG_BADGE;
};

export function ogCard(input: { title: string; themeLabel: string }): OgCard {
  const title = input.title.trim().slice(0, 80);
  const themeLabel = input.themeLabel.trim().slice(0, 40);
  return {
    title: title.length > 0 ? title : "クロの時報",
    themeLabel: themeLabel.length > 0 ? themeLabel : "クロの時報",
    badge: OG_BADGE,
  };
}

/** タイトルに出る文字だけの TrueType。取れないときは null。 */
export async function loadOgFont(text: string): Promise<ArrayBuffer | null> {
  const unique = Array.from(new Set(text)).join("");
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@600&text=${encodeURIComponent(unique)}`;

  try {
    const cssResponse = await fetch(cssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Safari/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!cssResponse.ok) {
      return null;
    }
    const css = await cssResponse.text();
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('truetype'\)/);
    const fontUrl = match?.[1];
    if (!fontUrl) {
      return null;
    }
    const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(5000) });
    if (!fontResponse.ok) {
      return null;
    }
    return fontResponse.arrayBuffer();
  } catch {
    return null;
  }
}
