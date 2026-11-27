import { ARTICLE_SLUG_PATTERN, ARTICLE_THEMES, type ArticleTheme } from "@/lib/article-schema";
import { renderMarkdown } from "@/lib/markdown/render";

const TOKYO = "Asia/Tokyo";
const SOURCE_ID_PATTERN = /^[1-9][0-9]*$/;
const CORRECTION_FORM = "https://github.com/Uzu83/kuro-jiho/issues/new";

const jstFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TOKYO,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

const THEME_LABELS: Record<ArticleTheme, string> = {
  fukuoka: "福岡市",
  it: "IT",
  gadget: "ガジェット",
  sports: "スポーツ",
  f1: "F1",
};

export type PublicSource = {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  accessedAt: string | null;
  accessedLabel: string | null;
  license: string | null;
};

export type PublicChecked = {
  claim: string;
  sourceIds: string[];
};

export type PublicRemoved = {
  claim: string;
  reason: string | null;
};

export type PublicCorrection = {
  id: string;
  createdAt: string;
  label: string;
  note: string;
};

export type PublicRelated = {
  slug: string;
  title: string;
};

export type PublicArticle = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  themeLabel: string;
  publishedAt: string;
  publishedLabel: string;
  updatedAt: string;
  updatedLabel: string;
  summary: [string, string, string];
  bodyHtml: string;
  sources: PublicSource[];
  checked: PublicChecked[];
  removed: PublicRemoved[];
  corrections: PublicCorrection[];
  related: PublicRelated[];
  reportHref: string;
};

export type PublishedArticleRow = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  slot: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  summary: string[];
  body_md: string;
  sources: unknown;
  verification: unknown;
  related: string[];
};

export type CorrectionRow = {
  id: string;
  created_at: string;
  note: string | null;
  version: number;
};

export type RelatedRow = {
  slug: string;
  title: string;
  status: string;
};

export function formatJst(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = jstFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  let hour = pick("hour");
  const minute = pick("minute");
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    return null;
  }
  if (hour === "24") {
    hour = "0";
  }

  return `${year}年${Number(month)}月${Number(day)}日 ${Number(hour)}:${minute.padStart(2, "0")}（日本時間）`;
}

export function themeLabel(theme: string): string {
  if ((ARTICLE_THEMES as readonly string[]).includes(theme)) {
    return THEME_LABELS[theme as ArticleTheme];
  }
  return "テーマ";
}

export function safeHttpsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname === "") {
    return null;
  }

  return url.toString();
}

export function articlePublicUrl(slug: string, siteUrl: string | null | undefined): string {
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.username === "" &&
        url.password === "" &&
        url.hostname !== ""
      ) {
        return `${url.origin}/articles/${slug}`;
      }
    } catch {
      // 相対パスに落とす。
    }
  }

  return `/articles/${slug}`;
}

/** Issue #8 の Issue Form。項目 id は article_url。 */
export function correctionReportHref(articleUrl: string): string {
  const url = new URL(CORRECTION_FORM);
  url.searchParams.set("template", "correction.yml");
  url.searchParams.set("article_url", articleUrl);
  return url.toString();
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function parseSources(value: unknown): PublicSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const sources: PublicSource[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = cleanText(item.id);
    const title = cleanText(item.title);
    const publisher = cleanText(item.publisher);
    const accessed = cleanText(item.accessed_at);
    if (!id || !SOURCE_ID_PATTERN.test(id) || !title || !publisher || !accessed || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const rawUrl = cleanText(item.url);
    sources.push({
      id,
      title,
      publisher,
      url: rawUrl ? safeHttpsUrl(rawUrl) : null,
      accessedAt: instant(accessed),
      accessedLabel: formatJst(accessed),
      license: cleanText(item.license),
    });
  }

  sources.sort((a, b) => Number(a.id) - Number(b.id));
  return sources;
}

export function parseVerification(
  value: unknown,
  sourceIds: ReadonlySet<string>,
): { checked: PublicChecked[]; removed: PublicRemoved[] } {
  if (!isRecord(value)) {
    return { checked: [], removed: [] };
  }

  const checked: PublicChecked[] = [];
  if (Array.isArray(value.checked)) {
    for (const item of value.checked) {
      if (!isRecord(item)) {
        continue;
      }
      const claim = cleanText(item.claim);
      if (!claim || !Array.isArray(item.source_ids)) {
        continue;
      }
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const sourceId of item.source_ids) {
        const text = cleanText(sourceId);
        if (!text || !sourceIds.has(text) || seen.has(text)) {
          continue;
        }
        seen.add(text);
        ids.push(text);
      }
      checked.push({ claim, sourceIds: ids });
    }
  }

  const removed: PublicRemoved[] = [];
  if (Array.isArray(value.removed)) {
    for (const item of value.removed) {
      if (!isRecord(item)) {
        continue;
      }
      const claim = cleanText(item.claim);
      if (!claim) {
        continue;
      }
      removed.push({ claim, reason: cleanText(item.reason) });
    }
  }

  return { checked, removed };
}

function demoteHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-6])\b([^>]*)>/gi, (_match, slash: string, level: string, rest: string) => {
    const next = Math.min(6, Number(level) + 1);
    return `<${slash}h${next}${rest}>`;
  });
}

function stripImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, "");
}

/** 出典［n］を出典欄のアンカーにする。id は数字だけ。タグの中は触らない。 */
export function linkCitations(html: string, sourceIds: ReadonlySet<string>): string {
  return html.replace(/<\/?[^>]+>|［([1-9][0-9]*)］/g, (match, id: string | undefined) => {
    if (!id || !sourceIds.has(id)) {
      return match;
    }
    return `<a href="#source-${id}">［${id}］</a>`;
  });
}

export async function renderArticleBody(markdown: string, sourceIds: readonly string[]): Promise<string> {
  const html = await renderMarkdown(markdown);
  const ids = new Set(sourceIds.filter((id) => SOURCE_ID_PATTERN.test(id)));
  return linkCitations(stripImages(demoteHeadings(html)), ids);
}

function parseSummary(value: unknown): [string, string, string] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const items = value.map((item) => cleanText(item));
  if (items.some((item) => item === null)) {
    return null;
  }
  return items as [string, string, string];
}

function parseCorrections(rows: readonly CorrectionRow[]): PublicCorrection[] {
  const corrections: (PublicCorrection & { version: number })[] = [];
  for (const row of rows) {
    const note = cleanText(row.note);
    const label = formatJst(row.created_at);
    const createdAt = instant(row.created_at);
    if (!note || !label || !createdAt || typeof row.id !== "string" || row.id.length === 0) {
      continue;
    }
    corrections.push({
      id: row.id,
      createdAt,
      label,
      note,
      version: Number.isFinite(row.version) ? row.version : 0,
    });
  }

  corrections.sort((a, b) => {
    const time = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (time !== 0 && !Number.isNaN(time)) {
      return time;
    }
    return b.version - a.version;
  });

  return corrections.map(({ id, createdAt, label, note }) => ({ id, createdAt, label, note }));
}

function parseRelated(slugs: readonly string[], rows: readonly RelatedRow[], self: string): PublicRelated[] {
  const titles = new Map<string, string>();
  for (const row of rows) {
    if (row.status !== "published" || row.slug === self || !ARTICLE_SLUG_PATTERN.test(row.slug)) {
      continue;
    }
    const title = cleanText(row.title);
    if (!title) {
      continue;
    }
    titles.set(row.slug, title);
  }

  const related: PublicRelated[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) {
      continue;
    }
    const title = titles.get(slug);
    if (!title) {
      continue;
    }
    seen.add(slug);
    related.push({ slug, title });
  }
  return related;
}

export function relatedSlugs(value: unknown, self: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item === self || seen.has(item) || !ARTICLE_SLUG_PATTERN.test(item)) {
      continue;
    }
    seen.add(item);
    slugs.push(item);
  }
  return slugs;
}

export async function toPublicArticle(input: {
  row: PublishedArticleRow;
  corrections: readonly CorrectionRow[];
  related: readonly RelatedRow[];
  siteUrl?: string | null;
}): Promise<PublicArticle | null> {
  const { row } = input;
  if (row.status !== "published" || !ARTICLE_SLUG_PATTERN.test(row.slug)) {
    return null;
  }

  const title = cleanText(row.title);
  const summary = parseSummary(row.summary);
  const publishedLabel = row.published_at ? formatJst(row.published_at) : null;
  const publishedAt = row.published_at ? instant(row.published_at) : null;
  const updatedLabel = formatJst(row.updated_at);
  const updatedAt = instant(row.updated_at);
  const sources = parseSources(row.sources);
  if (
    !title ||
    !summary ||
    !publishedLabel ||
    !publishedAt ||
    !updatedLabel ||
    !updatedAt ||
    typeof row.body_md !== "string" ||
    sources.length === 0
  ) {
    return null;
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const verification = parseVerification(row.verification, sourceIds);
  const bodyHtml = await renderArticleBody(row.body_md, sources.map((source) => source.id));
  const pageUrl = articlePublicUrl(row.slug, input.siteUrl);

  return {
    slug: row.slug,
    title,
    theme: row.theme,
    slot: row.slot,
    themeLabel: themeLabel(row.theme),
    publishedAt,
    publishedLabel,
    updatedAt,
    updatedLabel,
    summary,
    bodyHtml,
    sources,
    checked: verification.checked,
    removed: verification.removed,
    corrections: parseCorrections(input.corrections),
    related: parseRelated(relatedSlugs(row.related, row.slug), input.related, row.slug),
    reportHref: correctionReportHref(pageUrl),
  };
}
