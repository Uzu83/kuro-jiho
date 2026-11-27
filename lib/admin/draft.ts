export type SourceDraft = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  accessedAt: string;
  license: string;
};

export type CheckedDraft = {
  claim: string;
  sourceIds: string;
};

export type RemovedDraft = {
  claim: string;
  reason: string;
};

export type ArticleDraft = {
  title: string;
  slug: string;
  theme: string;
  slot: string;
  date: string;
  summary: [string, string, string];
  body: string;
  sources: SourceDraft[];
  checked: CheckedDraft[];
  removed: RemovedDraft[];
  related: string;
  status: string | null;
  version: number | null;
};

export type Choice = {
  value: string;
  label: string;
};

const EMPTY_SOURCE: SourceDraft = {
  id: "1",
  title: "",
  publisher: "",
  url: "",
  accessedAt: "",
  license: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summaryOf(value: unknown): [string, string, string] {
  const items = Array.isArray(value) ? value.map(text) : [];
  return [items[0] ?? "", items[1] ?? "", items[2] ?? ""];
}

function sourcesOf(value: unknown): SourceDraft[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...EMPTY_SOURCE }];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      return { ...EMPTY_SOURCE, id: String(index + 1) };
    }
    return {
      id: text(item.id) || String(index + 1),
      title: text(item.title),
      publisher: text(item.publisher),
      url: text(item.url),
      accessedAt: text(item.accessed_at),
      license: text(item.license),
    };
  });
}

function checkedOf(value: unknown): CheckedDraft[] {
  if (!isRecord(value) || !Array.isArray(value.checked) || value.checked.length === 0) {
    return [{ claim: "", sourceIds: "1" }];
  }

  return value.checked.map((item) => {
    if (!isRecord(item)) {
      return { claim: "", sourceIds: "" };
    }
    const ids = Array.isArray(item.source_ids) ? item.source_ids.map(text).filter(Boolean) : [];
    return { claim: text(item.claim), sourceIds: ids.join(" ") };
  });
}

function removedOf(value: unknown): RemovedDraft[] {
  if (!isRecord(value) || !Array.isArray(value.removed)) {
    return [];
  }

  return value.removed.map((item) => {
    if (!isRecord(item)) {
      return { claim: "", reason: "" };
    }
    return { claim: text(item.claim), reason: text(item.reason) };
  });
}

export function emptyDraft(today: string): ArticleDraft {
  return {
    title: "",
    slug: "",
    theme: "fukuoka",
    slot: "07",
    date: today,
    summary: ["", "", ""],
    body: "",
    sources: [{ ...EMPTY_SOURCE }],
    checked: [{ claim: "", sourceIds: "1" }],
    removed: [],
    related: "",
    status: null,
    version: null,
  };
}

/** 既存の出典 id は振り直さない。空いている最小の正の整数を返す。 */
export function nextSourceId(sources: readonly { id: string }[]): string {
  const used = new Set(sources.map((source) => source.id));
  let next = 1;
  while (used.has(String(next))) {
    next += 1;
  }
  return String(next);
}

export function draftFromArticle(
  article: {
    title: string;
    slug: string;
    theme: string;
    slot: string;
    date: string;
    status: string;
    summary: unknown;
    body_md: string;
    sources: unknown;
    verification: unknown;
    related: unknown;
    version: number;
  },
): ArticleDraft {
  const related = Array.isArray(article.related)
    ? article.related.filter((item): item is string => typeof item === "string")
    : [];

  return {
    title: article.title,
    slug: article.slug,
    theme: article.theme,
    slot: article.slot,
    date: article.date,
    summary: summaryOf(article.summary),
    body: article.body_md,
    sources: sourcesOf(article.sources),
    checked: checkedOf(article.verification),
    removed: removedOf(article.verification),
    related: related.join("\n"),
    status: article.status,
    version: article.version,
  };
}
