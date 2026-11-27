import { z, type ZodIssue } from "zod";
import { ARTICLE_SLOTS } from "@/lib/article-schema";

export type SkipInput = {
  date: string;
  slot: (typeof ARTICLE_SLOTS)[number];
  reason: string | null;
};

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
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

const skipSchema = z.strictObject(
  {
    date: z.string({ error: "文字列にしてください" }).superRefine((value, ctx) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "YYYY-MM-DD の日付にしてください" });
        return;
      }
      if (!isRealDate(value)) {
        ctx.addIssue({ code: "custom", message: "実在する日付にしてください" });
      }
    }),
    slot: z.enum(ARTICLE_SLOTS, {
      error: "07、12、17、20 のいずれかにしてください",
    }),
    reason: z
      .string({ error: "文字列にしてください" })
      .trim()
      .min(1, { error: "空にはできません" })
      .max(2000, { error: "2000字以内にしてください" })
      .optional(),
  },
  { error: "オブジェクトにしてください" },
);

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
  return field.length === 0 ? "見送り" : field;
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

export function parseSkip(input: unknown): { ok: true; data: SkipInput } | { ok: false; errors: string[] } {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formatIssues(parsed.error.issues) };
  }
  return {
    ok: true,
    data: {
      date: parsed.data.date,
      slot: parsed.data.slot,
      reason: parsed.data.reason ?? null,
    },
  };
}
