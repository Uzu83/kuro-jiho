import { z, type ZodIssue } from "zod";

/**
 * 記事の作成・更新ペイロード。投稿 API と管理画面は
 * `parseArticleCreate` / `parseArticleUpdate` を使う。
 *
 * 列の取りうる値は
 * supabase/migrations/20261127073300_articles_revisions_rate_limits.sql
 * に合わせる。author / id / version / updated_at はサーバーが付ける。
 *
 * 作成 JSON:
 * title, slug, theme, slot, date, status, ai_generated (true),
 * summary (3件、各1〜80字), body_md (300〜4000字),
 * sources[{id,title,publisher,url,accessed_at,license?}],
 * verification.checked[{claim, source_ids}] (1件以上),
 * verification.removed[{claim, reason?}], related (slug 配列),
 * published_at (status が published のとき必須)。
 *
 * 更新 JSON は変える項目だけに、change_type
 * (update=軽微な修正 | correction=訂正 | publish | unpublish) を足す。
 * correction は change_note 必須。公開済みの更新も change_note 必須。
 * エラーと警告は「項目名：理由」の配列。使っていない出典は警告で、失敗にはしない。
 */

export const ARTICLE_THEMES = ["fukuoka", "it", "gadget", "sports", "f1"] as const;
export const ARTICLE_SLOTS = ["07", "12", "17", "20"] as const;
export const ARTICLE_STATUSES = ["draft", "published", "unpublished"] as const;
export const ARTICLE_CHANGE_TYPES = ["update", "correction", "publish", "unpublish"] as const;

export const ARTICLE_TEXT_LIMITS = {
  title: { min: 1, max: 60 },
  summaryItem: { min: 1, max: 80 },
  summaryCount: 3,
  body: { min: 300, max: 4000 },
} as const;

/** Issue #3 の slug。日付と枠は date / slot と別に突き合わせる。 */
export const ARTICLE_SLUG_PATTERN =
  /^\d{4}-\d{2}-\d{2}-(07|12|17|20)-[a-z0-9-]+$/;

const SOURCE_ID_PATTERN = /^[1-9][0-9]*$/;
const ACCESSED_AT_EXAMPLE = "2026-12-01T07:00:00+09:00";

export type ArticleTheme = (typeof ARTICLE_THEMES)[number];
export type ArticleSlot = (typeof ARTICLE_SLOTS)[number];
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
export type ArticleChangeType = (typeof ARTICLE_CHANGE_TYPES)[number];

export type ArticleValidationResult<T> =
  | { success: true; data: T; errors: []; warnings: string[] }
  | { success: false; errors: string[]; warnings: string[] };

export type ArticleUpdateContext = {
  status: ArticleStatus;
  slug: string;
  date: string;
  slot: ArticleSlot;
  body_md: string;
  published_at: string | null;
  sources: readonly { id: string }[];
  verification: {
    checked: readonly { source_ids: readonly string[] }[];
  };
  related: readonly string[];
};

type RefinementCtx = {
  addIssue: (issue: { code: "custom"; path: PropertyKey[]; message: string }) => void;
};

type SourceIdList = readonly { id: string }[];

type CheckedList = readonly { source_ids: readonly string[] }[];

function charCount(value: string): number {
  return Array.from(value).length;
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseTimestamp(value: string): { offset: string } | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) {
    return null;
  }

  const date = match[1] ?? "";
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offset = match[5] ?? "";
  if (!isRealDate(date) || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (!isPgTimeZoneOffset(offset)) {
    return null;
  }

  return { offset };
}

/** Postgres の timestamptz が受け付ける時差。Z か -15:59〜+15:59。 */
function isPgTimeZoneOffset(offset: string): boolean {
  if (offset === "Z") {
    return true;
  }

  const match = /^[+-](\d{2}):(\d{2})$/.exec(offset);
  if (!match?.[1] || !match[2]) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 15 && minute <= 59;
}

function hasTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function looksLikeTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}

function httpsUrlIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "https のURLにしてください";
  }

  if (url.protocol !== "https:" || url.hostname.length === 0) {
    return "https のURLにしてください";
  }

  if (url.username !== "" || url.password !== "") {
    return "ユーザー情報を含まない https のURLにしてください";
  }

  return null;
}

function accessedAtIssue(value: string): string | null {
  if (!hasTimeZone(value)) {
    return looksLikeTimestamp(value)
      ? "タイムゾーン（+09:00）が必要です"
      : `+09:00 付きのISO 8601にしてください（例: ${ACCESSED_AT_EXAMPLE}）`;
  }

  const parsed = parseTimestamp(value);
  if (!parsed || parsed.offset !== "+09:00") {
    if (parsed) {
      return `+09:00 付きのISO 8601にしてください（例: ${ACCESSED_AT_EXAMPLE}）`;
    }
    const offset = value.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
    if (!isPgTimeZoneOffset(offset)) {
      return "タイムゾーンのオフセットは -15:59 から +15:59、または Z にしてください";
    }
    return "実在する日時にしてください";
  }

  return null;
}

function publishedAtIssue(value: string): string | null {
  if (!hasTimeZone(value)) {
    return looksLikeTimestamp(value)
      ? "タイムゾーンが必要です"
      : "ISO 8601 の日時にしてください";
  }

  const offset = value.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  if (!isPgTimeZoneOffset(offset)) {
    return "タイムゾーンのオフセットは -15:59 から +15:59、または Z にしてください";
  }

  if (!parseTimestamp(value)) {
    return "実在する日時にしてください";
  }

  return null;
}

function hasRawScript(value: string): boolean {
  return /<\/?script\b/i.test(value);
}

function hasOtherRawHtml(value: string): boolean {
  const withoutScripts = value.replace(/<\/?script\b[^>]*/gi, "");
  const withoutAutolinks = withoutScripts.replace(/<https?:\/\/[^>\s]+>/gi, "");
  return (
    /<!--/.test(withoutAutolinks) ||
    /<!DOCTYPE/i.test(withoutAutolinks) ||
    /<\/?[A-Za-z]/.test(withoutAutolinks)
  );
}

function boundedText(min: number, max: number) {
  return z
    .string({ error: "文字列にしてください" })
    .trim()
    .superRefine((value, ctx) => {
      const count = charCount(value);
      if (count < min || count > max) {
        ctx.addIssue({
          code: "custom",
          message: `${min}〜${max}字にしてください（いま${count}字）`,
        });
      }
    });
}

const requiredText = z
  .string({ error: "文字列にしてください" })
  .trim()
  .min(1, { error: "1字以上にしてください" });

const dateSchema = z.string({ error: "文字列にしてください" }).superRefine((value, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "YYYY-MM-DD の日付にしてください" });
    return;
  }
  if (!isRealDate(value)) {
    ctx.addIssue({ code: "custom", message: "実在する日付にしてください" });
  }
});

const slugSchema = z.string({ error: "文字列にしてください" }).regex(ARTICLE_SLUG_PATTERN, {
  error: "YYYY-MM-DD-枠-名前 の形式にしてください（枠は 07、12、17、20）",
});

const httpsUrlSchema = z.string({ error: "文字列にしてください" }).superRefine((value, ctx) => {
  const issue = httpsUrlIssue(value);
  if (issue) {
    ctx.addIssue({ code: "custom", message: issue });
  }
});

const accessedAtSchema = z
  .string({ error: "文字列にしてください" })
  .superRefine((value, ctx) => {
    const issue = accessedAtIssue(value);
    if (issue) {
      ctx.addIssue({ code: "custom", message: issue });
    }
  });

const publishedAtSchema = z
  .union(
    [
      z.string({ error: "文字列か null にしてください" }).superRefine((value, ctx) => {
        const issue = publishedAtIssue(value);
        if (issue) {
          ctx.addIssue({ code: "custom", message: issue });
        }
      }),
      z.null(),
    ],
    { error: "文字列か null にしてください" },
  )
  .optional();

const sourceIdSchema = z.string({ error: "文字列にしてください" }).regex(SOURCE_ID_PATTERN, {
  error: '1 から始まる数字にしてください（例: "1"）',
});

const sourceSchema = z.strictObject(
  {
    id: sourceIdSchema,
    title: requiredText,
    publisher: requiredText,
    url: httpsUrlSchema,
    accessed_at: accessedAtSchema,
    license: requiredText.optional(),
  },
  { error: "オブジェクトにしてください" },
);

const checkedSchema = z.strictObject(
  {
    claim: requiredText,
    source_ids: z
      .array(sourceIdSchema, { error: "出典idの配列にしてください" })
      .min(1, { error: "出典idを1つ以上入れてください" }),
  },
  { error: "オブジェクトにしてください" },
);

const removedSchema = z.strictObject(
  {
    claim: requiredText,
    reason: requiredText.optional(),
  },
  { error: "オブジェクトにしてください" },
);

const verificationSchema = z.strictObject(
  {
    checked: z
      .array(checkedSchema, { error: "配列にしてください" })
      .min(1, { error: "1件以上必要です" }),
    removed: z.array(removedSchema, { error: "配列にしてください" }),
  },
  { error: "オブジェクトにしてください" },
);

const bodySchema = z.string({ error: "文字列にしてください" }).superRefine((value, ctx) => {
  const count = charCount(value);
  const { min, max } = ARTICLE_TEXT_LIMITS.body;
  if (count < min || count > max) {
    ctx.addIssue({
      code: "custom",
      message: `${min}〜${max}字にしてください（いま${count}字）`,
    });
  }
  if (hasRawScript(value)) {
    ctx.addIssue({ code: "custom", message: "<script> は使えません" });
  }
  if (hasOtherRawHtml(value)) {
    ctx.addIssue({ code: "custom", message: "生のHTMLは使えません" });
  }
  if (value.includes("![")) {
    ctx.addIssue({ code: "custom", message: "画像記法（![）は使えません" });
  }
});

const summaryItemSchema = boundedText(
  ARTICLE_TEXT_LIMITS.summaryItem.min,
  ARTICLE_TEXT_LIMITS.summaryItem.max,
);

const articleShape = z.strictObject(
  {
    title: boundedText(ARTICLE_TEXT_LIMITS.title.min, ARTICLE_TEXT_LIMITS.title.max),
    slug: slugSchema,
    theme: z.enum(ARTICLE_THEMES, {
      error: "fukuoka、it、gadget、sports、f1 のいずれかにしてください",
    }),
    slot: z.enum(ARTICLE_SLOTS, {
      error: "07、12、17、20 のいずれかにしてください",
    }),
    date: dateSchema,
    status: z.enum(ARTICLE_STATUSES, {
      error: "draft、published、unpublished のいずれかにしてください",
    }),
    ai_generated: z.literal(true, { error: "true だけを指定できます" }),
    summary: z
      .array(summaryItemSchema, { error: "3件の配列にしてください" })
      .length(ARTICLE_TEXT_LIMITS.summaryCount, { error: "3件ちょうどにしてください" }),
    body_md: bodySchema,
    sources: z
      .array(sourceSchema, { error: "1件以上の配列にしてください" })
      .min(1, { error: "1件以上必要です" }),
    verification: verificationSchema,
    related: z.array(slugSchema, { error: "slug の配列にしてください" }),
    published_at: publishedAtSchema,
  },
  { error: "オブジェクトにしてください" },
);

const changeNoteSchema = z
  .string({ error: "文字列にしてください" })
  .trim()
  .min(1, { error: "空にはできません" });

function joinPath(path: readonly PropertyKey[], extraKey?: string): string {
  const segments = extraKey === undefined ? [...path] : [...path, extraKey];
  let field = "";

  for (const segment of segments) {
    if (typeof segment === "number") {
      field += `[${segment}]`;
      continue;
    }
    const text = String(segment);
    field += field.length === 0 ? text : `.${text}`;
  }

  return field.length === 0 ? "記事" : field;
}

function fieldToPath(field: string): PropertyKey[] {
  if (field === "記事") {
    return [];
  }

  const path: PropertyKey[] = [];
  for (const match of field.matchAll(/([^[\].]+)|\[(\d+)\]/g)) {
    if (match[1]) {
      path.push(match[1]);
    } else if (match[2]) {
      path.push(Number(match[2]));
    }
  }
  return path;
}

export function splitArticleError(error: string): { field: string; reason: string } {
  const index = error.indexOf("：");
  if (index === -1) {
    return { field: "記事", reason: error };
  }

  return { field: error.slice(0, index), reason: error.slice(index + 1) };
}

function pushIssue(ctx: RefinementCtx, formatted: string) {
  const { field, reason } = splitArticleError(formatted);
  ctx.addIssue({ code: "custom", path: fieldToPath(field), message: reason });
}

function formatIssues(issues: readonly ZodIssue[]): string[] {
  const messages: string[] = [];

  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        messages.push(`${joinPath(issue.path, key)}：指定できない項目です`);
      }
      continue;
    }

    messages.push(`${joinPath(issue.path)}：${issue.message}`);
  }

  return [...new Set(messages)];
}

function slugParts(slug: string): { date: string; slot: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})-(07|12|17|20)-[a-z0-9-]+$/.exec(slug);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return { date: match[1], slot: match[2] };
}

function slugAlignmentMessages(slug: string, date: string, slot: string): string[] {
  const parts = slugParts(slug);
  if (!parts) {
    return [];
  }

  const messages: string[] = [];
  if (!isRealDate(parts.date)) {
    messages.push("slug：日付が実在しません");
  }
  if (parts.date !== date) {
    messages.push(`slug：日付が date（${date}）と一致しません`);
  }
  if (parts.slot !== slot) {
    messages.push(`slug：枠が slot（${slot}）と一致しません`);
  }
  return messages;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicated.add(value);
    }
    seen.add(value);
  }
  return [...duplicated];
}

function scanCitations(body: string, sourceIds: ReadonlySet<string>) {
  const missing: string[] = [];
  const seenMissing = new Set<string>();
  const used = new Set<string>();

  for (const match of body.matchAll(/［([^］]*)］/g)) {
    const inner = match[1] ?? "";
    if (SOURCE_ID_PATTERN.test(inner) && sourceIds.has(inner)) {
      used.add(inner);
      continue;
    }
    if (!seenMissing.has(inner)) {
      seenMissing.add(inner);
      missing.push(inner);
    }
  }

  return { missing, used };
}

function citationMessages(body: string, sources: SourceIdList): string[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  const known = [...sourceIds].join("、");
  const hint = known.length > 0 ? `（出典idは ${known}）` : "";
  const { missing } = scanCitations(body, sourceIds);
  return missing.map((inner) => `body_md：［${inner}］に対応する出典がありません${hint}`);
}

function unusedSourceWarnings(body: string, sources: SourceIdList): string[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  const { used } = scanCitations(body, sourceIds);
  const warnings: string[] = [];

  sources.forEach((source, index) => {
    if (!used.has(source.id)) {
      warnings.push(`sources[${index}].id：本文の［${source.id}］で使われていません`);
    }
  });

  return warnings;
}

function duplicateSourceMessages(sources: SourceIdList): string[] {
  const duplicated = duplicates(sources.map((source) => source.id));
  if (duplicated.length === 0) {
    return [];
  }

  return [`sources：id「${duplicated.join("」「")}」が重複しています`];
}

function checkedMessages(checked: CheckedList, sources: SourceIdList): string[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  const messages: string[] = [];

  checked.forEach((item, index) => {
    const missing = [...new Set(item.source_ids.filter((id) => !sourceIds.has(id)))];
    if (missing.length > 0) {
      messages.push(
        `verification.checked[${index}].source_ids：出典id「${missing.join("」「")}」が sources にありません`,
      );
    }

    const duplicated = duplicates(item.source_ids);
    if (duplicated.length > 0) {
      messages.push(
        `verification.checked[${index}].source_ids：出典id「${duplicated.join("」「")}」が重複しています`,
      );
    }
  });

  return messages;
}

function relatedMessages(related: readonly string[], slug: string): string[] {
  const messages: string[] = [];
  const duplicated = duplicates(related);
  if (duplicated.length > 0) {
    messages.push(`related：slug「${duplicated.join("」「")}」が重複しています`);
  }
  if (related.includes(slug)) {
    messages.push("related：記事自身の slug は入れられません");
  }
  return messages;
}

type ArticleFields = z.infer<typeof articleShape>;

function createCrossFieldMessages(data: ArticleFields): string[] {
  const publishedAt = data.published_at ?? null;
  const messages = [
    ...slugAlignmentMessages(data.slug, data.date, data.slot),
    ...duplicateSourceMessages(data.sources),
    ...citationMessages(data.body_md, data.sources),
    ...checkedMessages(data.verification.checked, data.sources),
    ...relatedMessages(data.related, data.slug),
  ];

  if (data.status === "published" && publishedAt === null) {
    messages.push("published_at：公開するときは必須です");
  }

  return messages;
}

export const articleCreateSchema = articleShape.superRefine((data, ctx) => {
  for (const message of createCrossFieldMessages(data)) {
    pushIssue(ctx, message);
  }
});

const articleUpdateShape = articleShape.partial().extend({
  change_type: z.enum(ARTICLE_CHANGE_TYPES, {
    error: "update、correction、publish、unpublish のいずれかにしてください",
  }),
  change_note: changeNoteSchema.optional(),
});

export type ArticleCreate = z.infer<typeof articleCreateSchema> & {
  published_at: string | null;
};
export type ArticleUpdate = z.infer<typeof articleUpdateShape>;
export type ArticleSource = z.infer<typeof sourceSchema>;

const UPDATE_CONTENT_KEYS = [
  "title",
  "slug",
  "theme",
  "slot",
  "date",
  "status",
  "ai_generated",
  "summary",
  "body_md",
  "sources",
  "verification",
  "related",
  "published_at",
] as const satisfies readonly (keyof ArticleUpdate)[];

function updateShapeMessages(data: ArticleUpdate): string[] {
  const messages: string[] = [];
  if (!UPDATE_CONTENT_KEYS.some((key) => data[key] !== undefined)) {
    messages.push("記事：更新する項目を1つ以上指定してください");
  }
  if (data.change_type === "correction" && data.change_note === undefined) {
    messages.push("change_note：訂正では必須です");
  }
  return messages;
}

export const articleUpdateSchema = articleUpdateShape.superRefine((data, ctx) => {
  for (const message of updateShapeMessages(data)) {
    pushIssue(ctx, message);
  }
});

function updateCrossFieldMessages(data: ArticleUpdate, context: ArticleUpdateContext): string[] {
  const messages: string[] = [];

  if (
    data.change_note === undefined &&
    data.change_type !== "correction" &&
    context.status === "published"
  ) {
    messages.push("change_note：公開済みの記事を更新するときは必須です");
  }

  const status = data.status ?? context.status;
  const publishedAt =
    data.published_at !== undefined ? data.published_at : context.published_at;
  if (status === "published" && publishedAt === null) {
    messages.push("published_at：公開するときは必須です");
  }
  if (data.change_type === "publish" && status !== "published") {
    messages.push("status：publish のときは published にしてください");
  }
  if (data.change_type === "unpublish" && status !== "unpublished") {
    messages.push("status：unpublish のときは unpublished にしてください");
  }

  if (data.slug !== undefined || data.date !== undefined || data.slot !== undefined) {
    messages.push(
      ...slugAlignmentMessages(
        data.slug ?? context.slug,
        data.date ?? context.date,
        data.slot ?? context.slot,
      ),
    );
  }

  const sources = data.sources ?? context.sources;
  if (data.sources !== undefined) {
    messages.push(...duplicateSourceMessages(data.sources));
  }
  if (data.body_md !== undefined || data.sources !== undefined) {
    messages.push(...citationMessages(data.body_md ?? context.body_md, sources));
  }
  if (data.verification !== undefined || data.sources !== undefined) {
    const checked = data.verification?.checked ?? context.verification.checked;
    messages.push(...checkedMessages(checked, sources));
  }

  const slug = data.slug ?? context.slug;
  if (data.related !== undefined) {
    messages.push(...relatedMessages(data.related, slug));
  } else if (data.slug !== undefined && context.related.includes(data.slug)) {
    messages.push("related：記事自身の slug は入れられません");
  }

  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSources(value: unknown): SourceIdList | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const sources: { id: string }[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string") {
      return null;
    }
    sources.push({ id: item.id });
  }
  return sources;
}

function warningsFromCreateInput(input: unknown): string[] {
  if (!isRecord(input) || typeof input.body_md !== "string") {
    return [];
  }

  const sources = readSources(input.sources);
  if (!sources) {
    return [];
  }

  return unusedSourceWarnings(input.body_md, sources);
}

function warningsFromUpdateInput(input: unknown, context: ArticleUpdateContext): string[] {
  if (!isRecord(input)) {
    return [];
  }

  const touchesBody = Object.hasOwn(input, "body_md");
  const touchesSources = Object.hasOwn(input, "sources");
  if (!touchesBody && !touchesSources) {
    return [];
  }

  const body = touchesBody
    ? typeof input.body_md === "string"
      ? input.body_md
      : null
    : context.body_md;
  if (body === null) {
    return [];
  }

  const sources = touchesSources ? readSources(input.sources) : context.sources;
  if (!sources) {
    return [];
  }

  return unusedSourceWarnings(body, sources);
}

function failure<T>(errors: string[], warnings: string[]): ArticleValidationResult<T> {
  return { success: false, errors, warnings };
}

export function parseArticleCreate(input: unknown): ArticleValidationResult<ArticleCreate> {
  const parsed = articleCreateSchema.safeParse(input);
  const warnings = warningsFromCreateInput(input);

  if (!parsed.success) {
    return failure(formatIssues(parsed.error.issues), warnings);
  }

  return {
    success: true,
    data: {
      ...parsed.data,
      published_at: parsed.data.published_at ?? null,
    },
    errors: [],
    warnings,
  };
}

export function parseArticleUpdate(
  input: unknown,
  context: ArticleUpdateContext,
): ArticleValidationResult<ArticleUpdate> {
  const schema = articleUpdateSchema.superRefine((data, ctx) => {
    for (const message of updateCrossFieldMessages(data, context)) {
      pushIssue(ctx, message);
    }
  });
  const parsed = schema.safeParse(input);
  const warnings = warningsFromUpdateInput(input, context);

  if (!parsed.success) {
    return failure(formatIssues(parsed.error.issues), warnings);
  }

  return {
    success: true,
    data: parsed.data,
    errors: [],
    warnings,
  };
}
