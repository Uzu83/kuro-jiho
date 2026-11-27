import { z, type ZodError } from "zod";

const SLUG_PATTERN = /^(\d{4}-\d{2}-\d{2})-(07|12|17|20)-[a-z0-9-]+$/;

export const themeSchema = z.enum(["fukuoka", "it", "gadget", "sports", "f1"]);
export const slotSchema = z.enum(["07", "12", "17", "20"]);
export const statusSchema = z.enum(["draft", "published", "unpublished"]);
export const changeTypeSchema = z.enum(["update", "correction", "publish", "unpublish"]);

export type ArticleTheme = z.output<typeof themeSchema>;
export type ArticleSlot = z.output<typeof slotSchema>;
export type ArticleStatus = z.output<typeof statusSchema>;
export type ArticleChangeType = z.output<typeof changeTypeSchema>;

type ZodIssue = ZodError["issues"][number];

const sourceIdSchema = z.preprocess((value) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return value;
}, z.string().regex(/^[1-9]\d*$/));

const httpsUrlSchema = z.string().refine((value) => {
  if (!value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}, "https のURLにしてください");

const accessedAtSchema = z.string().refine((value) => isJstTimestamp(value), "日本時間（+09:00）のISO日時にしてください");

const slugSchema = z.string().regex(SLUG_PATTERN).refine((value) => {
  const date = value.slice(0, 10);
  return isCalendarDate(date);
}, "存在する日付にしてください");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => isCalendarDate(value), "存在する日付にしてください");

const sourceSchema = z.strictObject({
  id: sourceIdSchema,
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: httpsUrlSchema,
  accessed_at: accessedAtSchema,
  license: z.string().min(1).optional(),
});

const checkedSchema = z.strictObject({
  claim: z.string().min(1),
  source_ids: z.array(sourceIdSchema).min(1),
});

const verificationSchema = z.strictObject({
  checked: z.array(checkedSchema).min(1),
  removed: z.array(z.string().min(1)),
});

const summarySchema = z.array(z.string().min(1).max(80)).length(3);
const bodySchema = z.string().min(300).max(4000);
const titleSchema = z.string().min(1).max(60);
const relatedSchema = z.array(slugSchema);

const articleCreateObject = z.strictObject({
  title: titleSchema,
  slug: slugSchema,
  theme: themeSchema,
  slot: slotSchema,
  date: dateSchema,
  status: statusSchema,
  ai_generated: z.literal(true),
  summary: summarySchema,
  body_md: bodySchema,
  sources: z.array(sourceSchema).min(1),
  verification: verificationSchema,
  related: relatedSchema,
});

const articleUpdateObject = z.strictObject({
  title: titleSchema.optional(),
  slug: slugSchema.optional(),
  theme: themeSchema.optional(),
  slot: slotSchema.optional(),
  date: dateSchema.optional(),
  status: statusSchema.optional(),
  ai_generated: z.literal(true).optional(),
  summary: summarySchema.optional(),
  body_md: bodySchema.optional(),
  sources: z.array(sourceSchema).min(1).optional(),
  verification: verificationSchema.optional(),
  related: relatedSchema.optional(),
  change_type: changeTypeSchema,
  change_note: z.string().optional(),
});

export type ArticleSource = z.output<typeof sourceSchema>;
export type ArticleCreate = z.output<typeof articleCreateObject>;
export type ArticleUpdate = z.output<typeof articleUpdateObject>;

type ArticleFields = {
  slug?: string;
  date?: string;
  slot?: string;
  body_md?: string;
  sources?: ArticleSource[];
  verification?: ArticleCreate["verification"];
};

export type ArticleParseSuccess<T> = {
  ok: true;
  data: T;
  warnings: string[];
};

export type ArticleParseFailure = {
  ok: false;
  errors: string[];
};

export type ArticleParseResult<T> = ArticleParseSuccess<T> | ArticleParseFailure;

export type ArticleUpdateContext = {
  status?: ArticleStatus;
};

export const articleCreateSchema = articleCreateObject.superRefine((value, ctx) => {
  addCrossFieldIssues(value, ctx);
});

export function articleUpdateSchema(context: ArticleUpdateContext = {}) {
  return articleUpdateObject.superRefine((value, ctx) => {
    addCrossFieldIssues(value, ctx);
    addChangeNoteIssue(value, context, ctx);
  });
}

export function parseArticleCreate(input: unknown): ArticleParseResult<ArticleCreate> {
  const parsed = articleCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: toErrors(parsed.error) };
  return {
    ok: true,
    data: parsed.data,
    warnings: unusedSourceWarnings(parsed.data.body_md, parsed.data.sources),
  };
}

export function parseArticleUpdate(
  input: unknown,
  context: ArticleUpdateContext = {},
): ArticleParseResult<ArticleUpdate> {
  const parsed = articleUpdateSchema(context).safeParse(input);
  if (!parsed.success) return { ok: false, errors: toErrors(parsed.error) };
  const warnings =
    parsed.data.body_md !== undefined && parsed.data.sources !== undefined
      ? unusedSourceWarnings(parsed.data.body_md, parsed.data.sources)
      : [];
  return { ok: true, data: parsed.data, warnings };
}

function addCrossFieldIssues(value: ArticleFields, ctx: z.RefinementCtx): void {
  if (value.slug !== undefined && SLUG_PATTERN.test(value.slug) && isCalendarDate(value.slug.slice(0, 10))) {
    const slugDate = value.slug.slice(0, 10);
    const slugSlot = value.slug.slice(11, 13);
    if ((value.date !== undefined && value.date !== slugDate) || (value.slot !== undefined && value.slot !== slugSlot)) {
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: "日付・枠が date と slot と一致していません",
      });
    }
  }

  if (value.body_md !== undefined) {
    if (/<\/?[a-z]/i.test(value.body_md)) {
      ctx.addIssue({ code: "custom", path: ["body_md"], message: "生のHTMLは使えません" });
    }
    if (value.body_md.includes("![")) {
      ctx.addIssue({ code: "custom", path: ["body_md"], message: "画像記法は使えません" });
    }
  }

  if (value.sources !== undefined) {
    const seen = new Set<string>();
    for (const source of value.sources) {
      if (seen.has(source.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: `出典「${source.id}」が重複しています`,
        });
      }
      seen.add(source.id);
    }
  }

  if (value.body_md !== undefined && value.sources !== undefined) {
    const known = new Set(value.sources.map((source) => source.id));
    for (const id of new Set(citationIds(value.body_md))) {
      if (!known.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["body_md"],
          message: `本文の［${id}］に対応する出典がありません`,
        });
      }
    }
  }

  if (value.verification !== undefined && value.sources !== undefined) {
    const known = new Set(value.sources.map((source) => source.id));
    value.verification.checked.forEach((item, index) => {
      for (const id of item.source_ids) {
        if (!known.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["verification", "checked", index, "source_ids"],
            message: `出典「${id}」はありません`,
          });
        }
      }
    });
  }
}

function addChangeNoteIssue(
  value: { change_type?: ArticleChangeType; change_note?: string },
  context: ArticleUpdateContext,
  ctx: z.RefinementCtx,
): void {
  const note = value.change_note?.trim() ?? "";
  if (value.change_note !== undefined && note === "") {
    ctx.addIssue({ code: "custom", path: ["change_note"], message: "内容を書いてください" });
    return;
  }
  if (note !== "") return;
  if (value.change_type === "correction") {
    ctx.addIssue({ code: "custom", path: ["change_note"], message: "訂正内容を書いてください" });
    return;
  }
  if (context.status === "published") {
    ctx.addIssue({
      code: "custom",
      path: ["change_note"],
      message: "公開済みの記事を変えるときは内容を書いてください",
    });
  }
}

function unusedSourceWarnings(body: string, sources: ArticleSource[]): string[] {
  const used = new Set(citationIds(body));
  return sources
    .filter((source) => !used.has(source.id))
    .map((source) => `sources：出典「${source.id}」は本文で使われていません`);
}

function citationIds(body: string): string[] {
  const pattern = /［(\d+)］|\[(\d+)\](?!\()/g;
  return [...body.matchAll(pattern)].flatMap((match) => {
    const id = match[1] ?? match[2];
    return id === undefined ? [] : [id];
  });
}

function toErrors(error: ZodError): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const issue of error.issues) {
    const line = `${formatPath(issue.path)}：${reason(issue)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    errors.push(line);
  }
  return errors;
}

function reason(issue: ZodIssue): string {
  const field = fieldName(issue.path);
  if (field === "ai_generated" && issue.code !== "custom") {
    return "true のみ指定できます";
  }

  switch (issue.code) {
    case "custom":
      return issue.message;
    case "invalid_type":
      if (issue.expected === "object" && issue.path.length === 0) return "オブジェクトで入れてください";
      return issue.input === undefined ? "入力してください" : "値が不正です";
    case "invalid_value":
      if (field === "theme") return "fukuoka、it、gadget、sports、f1 のいずれかにしてください";
      if (field === "slot") return "07、12、17、20 のいずれかにしてください";
      if (field === "status") return "draft、published、unpublished のいずれかにしてください";
      if (field === "change_type") return "update、correction、publish、unpublish のいずれかにしてください";
      return "指定できる値ではありません";
    case "too_small":
    case "too_big":
      return sizeReason(field, issue);
    case "invalid_format":
      if (field === "slug" || field === "related") {
        return "日付-枠-名前 の形にしてください（例: 2026-12-01-07-topic）";
      }
      if (field === "id" || field === "source_ids") return "1以上の出典番号にしてください";
      if (field === "date") return "YYYY-MM-DD にしてください";
      return "形式が正しくありません";
    case "unrecognized_keys":
      return `未対応の項目です（${issue.keys.join("、")}）`;
    default:
      return issue.message;
  }
}

function sizeReason(field: string, issue: Extract<ZodIssue, { code: "too_small" | "too_big" }>): string {
  const big = issue.code === "too_big";
  if (field === "title") return big ? "60文字以内にしてください" : "1文字以上にしてください";
  if (field === "summary" && issue.origin === "string") {
    return big ? "80文字以内にしてください" : "1文字以上にしてください";
  }
  if (field === "summary") return "3件にしてください";
  if (field === "body_md") return big ? "4000文字以内にしてください" : "300文字以上にしてください";
  if (field === "sources") return "出典を1件以上入れてください";
  if (field === "checked") return "確かめた点を1件以上入れてください";
  if (field === "source_ids") return "出典番号を1件以上入れてください";
  if (issue.origin === "string") return big ? "長すぎます" : "入力してください";
  if (issue.origin === "array") return big ? "件数が多すぎます" : "件数が足りません";
  return "値が不正です";
}

function fieldName(path: PropertyKey[]): string {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const part = path[index];
    if (typeof part === "string") return part;
  }
  return "";
}

function formatPath(path: PropertyKey[]): string {
  let formatted = "";
  for (const part of path) {
    if (typeof part === "number") formatted += `[${part}]`;
    else formatted += formatted.length === 0 ? String(part) : `.${String(part)}`;
  }
  return formatted || "記事";
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isJstTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\+09:00$/.exec(value);
  if (!match) return false;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  return isCalendarDate(`${match[1]}-${match[2]}-${match[3]}`);
}
