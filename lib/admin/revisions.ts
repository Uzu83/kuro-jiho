import type { ArticleSlot } from "@/lib/article-schema";
import { formatJst, themeLabel } from "@/lib/articles/public";
import { slotClock } from "@/lib/listings/model";

const FIELD_LABELS: Record<string, string> = {
  title: "見出し",
  slug: "slug",
  theme: "テーマ",
  slot: "枠",
  date: "日付",
  status: "状態",
  summary: "要約",
  body_md: "本文",
  sources: "出典",
  verification: "確かめた経緯",
  related: "関連",
  published_at: "公開日時",
  author: "作成",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  published: "公開",
  unpublished: "非公開",
};

const CHANGE_LABELS: Record<string, string> = {
  create: "作成",
  update: "軽微な修正",
  correction: "訂正",
  publish: "公開",
  unpublish: "非公開化",
};

const DIFF_FIELDS = [
  "title",
  "slug",
  "theme",
  "slot",
  "date",
  "status",
  "summary",
  "body_md",
  "sources",
  "verification",
  "related",
  "published_at",
  "author",
] as const;

export type RevisionChange = {
  field: string;
  text: string;
};

export type RevisionView = {
  id: string;
  version: number;
  changeLabel: string;
  note: string | null;
  createdLabel: string;
  actorLabel: "クロ" | "管理者";
  changes: RevisionChange[];
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "状態不明";
}

export function actorLabel(actor: string): "クロ" | "管理者" {
  return actor === "kuro" ? "クロ" : "管理者";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${key}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function displayValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "（なし）";
  }
  if (field === "status" && typeof value === "string") {
    return statusLabel(value);
  }
  if (field === "theme" && typeof value === "string") {
    return themeLabel(value);
  }
  if (field === "slot" && (value === "07" || value === "12" || value === "17" || value === "20")) {
    return slotClock(value as ArticleSlot);
  }
  if (field === "author" && typeof value === "string") {
    return value === "kuro" ? "クロ" : "管理者";
  }
  if (field === "summary" && Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : stable(item))).join("\n");
  }
  if (field === "related" && Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : stable(item))).join("\n");
  }
  if (typeof value === "string") {
    return value;
  }
  return stable(value);
}

function truncate(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= 1200) {
    return value;
  }
  return `${chars.slice(0, 1200).join("")}…`;
}

function lineDiff(before: string, after: string): string {
  const left = before.split("\n");
  const right = after.split("\n");
  if (left.length > 80 || right.length > 80) {
    return `変更前:\n${truncate(before)}\n変更後:\n${truncate(after)}`;
  }

  const height = left.length + 1;
  const width = right.length + 1;
  const scores: number[] = Array.from({ length: height * width }, () => 0);
  const at = (y: number, x: number) => y * width + x;

  for (let y = left.length - 1; y >= 0; y -= 1) {
    for (let x = right.length - 1; x >= 0; x -= 1) {
      scores[at(y, x)] =
        left[y] === right[x]
          ? (scores[at(y + 1, x + 1)] ?? 0) + 1
          : Math.max(scores[at(y + 1, x)] ?? 0, scores[at(y, x + 1)] ?? 0);
    }
  }

  const lines: string[] = [];
  let y = 0;
  let x = 0;
  while (y < left.length && x < right.length) {
    if (left[y] === right[x]) {
      y += 1;
      x += 1;
      continue;
    }
    if ((scores[at(y + 1, x)] ?? 0) >= (scores[at(y, x + 1)] ?? 0)) {
      lines.push(`- ${left[y] ?? ""}`);
      y += 1;
    } else {
      lines.push(`+ ${right[x] ?? ""}`);
      x += 1;
    }
  }
  while (y < left.length) {
    lines.push(`- ${left[y] ?? ""}`);
    y += 1;
  }
  while (x < right.length) {
    lines.push(`+ ${right[x] ?? ""}`);
    x += 1;
  }

  return truncate(lines.join("\n"));
}

function fieldChange(field: string, before: unknown, after: unknown): RevisionChange | null {
  if (stable(before) === stable(after)) {
    return null;
  }

  const previous = displayValue(field, before);
  const next = displayValue(field, after);
  const text =
    field === "body_md" && typeof before === "string" && typeof after === "string"
      ? lineDiff(before, after)
      : `変更前: ${truncate(previous)}\n変更後: ${truncate(next)}`;

  return { field: FIELD_LABELS[field] ?? field, text };
}

export function revisionViews(input: {
  current: Record<string, unknown>;
  revisions: readonly {
    id: string;
    version: number;
    snapshot: unknown;
    change_type: string;
    note: string | null;
    actor: string;
    created_at: string;
  }[];
}): RevisionView[] {
  const ordered = [...input.revisions].sort((a, b) => a.version - b.version);
  const views: RevisionView[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const revision = ordered[index];
    if (!revision) {
      continue;
    }
    const before = isRecord(revision.snapshot) ? revision.snapshot : {};
    const afterSource = ordered[index + 1]?.snapshot;
    const after = isRecord(afterSource) ? afterSource : input.current;
    const changes: RevisionChange[] = [];
    for (const field of DIFF_FIELDS) {
      const change = fieldChange(field, before[field], after[field]);
      if (change) {
        changes.push(change);
      }
    }

    const note = revision.note?.trim() ?? "";
    views.push({
      id: revision.id,
      version: revision.version,
      changeLabel: CHANGE_LABELS[revision.change_type] ?? "更新",
      note: note.length > 0 ? note : null,
      createdLabel: formatJst(revision.created_at) ?? "日時不明",
      actorLabel: actorLabel(revision.actor),
      changes,
    });
  }

  views.sort((a, b) => b.version - a.version);
  return views;
}
