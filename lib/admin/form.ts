import { splitArticleError } from "@/lib/article-schema";

export type ArticleFormInput = {
  title: string;
  slug: string;
  theme: string;
  slot: string;
  date: string;
  summary: [string, string, string];
  body_md: string;
  sources: {
    id: string;
    title: string;
    publisher: string;
    url: string;
    accessed_at: string;
    license?: string;
  }[];
  checked: { claim: string; source_ids: string[] }[];
  removed: { claim: string; reason?: string }[];
  related: string[];
  changeKind: string;
  changeNote: string;
  intent: "save" | "publish" | "unpublish" | "preview" | "unknown";
};

const MAX_ROWS = 20;

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function rowCount(form: FormData, key: string): number {
  const raw = read(form, key).trim();
  if (!/^\d+$/.test(raw)) {
    return 0;
  }
  return Math.min(Number(raw), MAX_ROWS);
}

function sourceIds(value: string): string[] {
  return value
    .split(/[\s,、]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseArticleForm(form: FormData): ArticleFormInput {
  const intentRaw = read(form, "intent");
  const intent =
    intentRaw === "save" ||
    intentRaw === "publish" ||
    intentRaw === "unpublish" ||
    intentRaw === "preview"
      ? intentRaw
      : "unknown";

  const sources = Array.from({ length: rowCount(form, "source_count") }, (_, index) => {
    const license = read(form, `source_${index}_license`).trim();
    return {
      id: read(form, `source_${index}_id`).trim(),
      title: read(form, `source_${index}_title`).trim(),
      publisher: read(form, `source_${index}_publisher`).trim(),
      url: read(form, `source_${index}_url`).trim(),
      accessed_at: read(form, `source_${index}_accessed_at`).trim(),
      ...(license.length > 0 ? { license } : {}),
    };
  });

  const checked = Array.from({ length: rowCount(form, "checked_count") }, (_, index) => ({
    claim: read(form, `checked_${index}_claim`).trim(),
    source_ids: sourceIds(read(form, `checked_${index}_source_ids`)),
  }));

  const removed = Array.from({ length: rowCount(form, "removed_count") }, (_, index) => {
    const reason = read(form, `removed_${index}_reason`).trim();
    return {
      claim: read(form, `removed_${index}_claim`).trim(),
      ...(reason.length > 0 ? { reason } : {}),
    };
  });

  const related = read(form, "related")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    title: read(form, "title").trim(),
    slug: read(form, "slug").trim(),
    theme: read(form, "theme").trim(),
    slot: read(form, "slot").trim(),
    date: read(form, "date").trim(),
    summary: [read(form, "summary_0").trim(), read(form, "summary_1").trim(), read(form, "summary_2").trim()],
    body_md: read(form, "body_md"),
    sources,
    checked,
    removed,
    related,
    changeKind: read(form, "change_kind").trim(),
    changeNote: read(form, "change_note").trim(),
    intent,
  };
}

export function groupFieldErrors(errors: readonly string[]): {
  fieldErrors: Record<string, string[]>;
  rest: string[];
} {
  const fieldErrors: Record<string, string[]> = {};
  const rest: string[] = [];

  for (const error of errors) {
    const { field, reason } = splitArticleError(error);
    if (field === "記事") {
      rest.push(error);
      continue;
    }
    const list = fieldErrors[field] ?? [];
    list.push(reason);
    fieldErrors[field] = list;
  }

  return { fieldErrors, rest };
}
