import type { PublicArticle } from "@/lib/articles/public";
import {
  formatJst,
  parseSources,
  parseVerification,
  renderArticleBody,
  themeLabel,
} from "@/lib/articles/public";

function lines(summary: readonly string[]): [string, string, string] {
  return [summary[0] ?? "", summary[1] ?? "", summary[2] ?? ""];
}

/** 保存前のフォームを、公開記事と同じ描画で見せる。状態は見ない。 */
export async function buildArticlePreview(input: {
  title: string;
  slug: string;
  theme: string;
  summary: readonly string[];
  body_md: string;
  sources: unknown;
  verification: unknown;
  now: Date;
}): Promise<PublicArticle> {
  const sources = parseSources(input.sources);
  const sourceIds = new Set(sources.map((source) => source.id));
  const verification = parseVerification(input.verification, sourceIds);
  const nowIso = input.now.toISOString();
  const label = formatJst(nowIso) ?? "プレビュー";
  let bodyHtml = "";
  try {
    bodyHtml = await renderArticleBody(
      input.body_md,
      sources.map((source) => source.id),
    );
  } catch {
    bodyHtml = "";
  }

  const summary = lines(input.summary);

  const slot = /^\d{4}-\d{2}-\d{2}-(07|12|17|20)-/.exec(input.slug)?.[1] ?? "";

  return {
    slug: input.slug,
    title: input.title.trim().length > 0 ? input.title.trim() : "（無題）",
    theme: input.theme,
    slot,
    themeLabel: themeLabel(input.theme),
    publishedAt: nowIso,
    publishedLabel: label,
    updatedAt: nowIso,
    updatedLabel: label,
    summary,
    bodyHtml,
    sources,
    checked: verification.checked,
    removed: verification.removed,
    corrections: [],
    related: [],
    reportHref: "#",
  };
}
