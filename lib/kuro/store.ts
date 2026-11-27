export type ArticleSummary = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
  source_urls: string[];
};

export type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  summary: string[];
  body_md: string;
  sources: unknown;
  verification: unknown;
  related: string[];
  ai_generated: boolean;
  author: string;
  version: number;
};

export type ArticleWrite = {
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
  published_at: string | null;
  summary: string[];
  body_md: string;
  sources: unknown;
  verification: unknown;
  related: string[];
};

export type ArticlePatch = Partial<ArticleWrite>;

export type ArticleRevision = {
  changeType: string;
  changeNote: string | null;
  expectedVersion: number;
};

export type SavedArticle = {
  slug: string;
  version: number;
  theme: string;
  date: string;
};

export type SkipRecord = {
  id: string;
  date: string;
  slot: string;
  status: "skipped";
};

export class SlotConflictError extends Error {
  constructor() {
    super("slot conflict");
    this.name = "SlotConflictError";
  }
}

export class SlugConflictError extends Error {
  constructor() {
    super("slug conflict");
    this.name = "SlugConflictError";
  }
}

export class ArticleNotFoundError extends Error {
  constructor() {
    super("article not found");
    this.name = "ArticleNotFoundError";
  }
}

export class RevisionNoteError extends Error {
  constructor() {
    super("correction note required");
    this.name = "RevisionNoteError";
  }
}

export class StaleArticleError extends Error {
  constructor() {
    super("stale article version");
    this.name = "StaleArticleError";
  }
}

export function sourceUrls(sources: unknown): string[] {
  if (!Array.isArray(sources)) {
    return [];
  }

  const urls: string[] = [];
  for (const item of sources) {
    if (typeof item === "object" && item !== null && "url" in item && typeof item.url === "string") {
      urls.push(item.url);
    }
  }
  return urls;
}

export function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match?.[1]) {
      return match[1];
    }
  }
  throw new Error("invalid date");
}

/** SQLSTATE だけを見て、メッセージ本文は呼び出し元へ返さない。 */
export function mapDatabaseError(code: string | undefined, message: string | undefined): Error {
  const text = message ?? "";
  if (code === "23505") {
    if (text.includes("articles_slug")) {
      return new SlugConflictError();
    }
    return new SlotConflictError();
  }
  if (code === "23514" && /correction/i.test(text)) {
    return new RevisionNoteError();
  }
  if (code === "40001") {
    return new StaleArticleError();
  }
  return new Error("database request failed");
}

export type KuroStore = {
  listRecent(sinceDate: string): Promise<ArticleSummary[]>;
  findBySlug(slug: string): Promise<ArticleRecord | null>;
  findPublishedId(date: string, slot: string): Promise<string | null>;
  insertArticle(article: ArticleWrite): Promise<SavedArticle>;
  updateArticle(id: string, patch: ArticlePatch, revision: ArticleRevision): Promise<SavedArticle>;
  insertSkip(input: { date: string; slot: string; reason: string | null }): Promise<SkipRecord>;
  pruneKuroRateLimits(): Promise<void>;
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
};
