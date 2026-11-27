import "server-only";

import {
  ARTICLE_SLUG_PATTERN,
  parseArticleCreate,
  parseArticleUpdate,
  type ArticleCreate,
  type ArticleStatus,
  type ArticleSlot,
  type ArticleUpdate,
  type ArticleUpdateContext,
} from "@/lib/article-schema";
import {
  bearerTokenMatches,
  clientAddress,
  parseTokenHashes,
  readBearerToken,
} from "@/lib/kuro/auth";
import { recentSince } from "@/lib/kuro/dates";
import {
  MESSAGES,
  articlePublicUrl,
  jsonBody,
  jsonError,
  parseDays,
  readJson,
} from "@/lib/kuro/http";
import { authFailureKey, KURO_LIMITS, retryAfterSeconds } from "@/lib/kuro/limits";
import { parseSkip } from "@/lib/kuro/skip";
import {
  ArticleNotFoundError,
  RevisionNoteError,
  SlugConflictError,
  SlotConflictError,
  StaleArticleError,
  type ArticlePatch,
  type ArticleRecord,
  type ArticleWrite,
  type KuroStore,
} from "@/lib/kuro/store";
import type { ArticleSurface } from "@/lib/kuro/revalidate";

export type KuroDeps = {
  store: KuroStore;
  tokenSha256: string | undefined;
  siteUrl: string | undefined;
  now?: Date;
  revalidateArticle?: (surface: ArticleSurface) => void;
  revalidateSkip?: (date: string) => void;
};

const PATCH_KEYS = [
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
] as const satisfies readonly (keyof ArticleUpdate)[];

function nowOf(deps: KuroDeps): Date {
  return deps.now ?? new Date();
}

function logFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : "Error";
  console.error(`kuro api ${name}`);
}

function failureResponse(error: unknown): Response {
  if (error instanceof SlotConflictError) {
    return jsonError(409, MESSAGES.slotConflict);
  }
  if (error instanceof SlugConflictError) {
    return jsonError(409, MESSAGES.slugConflict);
  }
  if (error instanceof StaleArticleError) {
    return jsonError(409, MESSAGES.staleArticle);
  }
  if (error instanceof ArticleNotFoundError) {
    return jsonError(404, MESSAGES.notFound);
  }
  if (error instanceof RevisionNoteError) {
    return jsonBody(400, { errors: ["change_note：訂正では必須です"], warnings: [] });
  }
  logFailure(error);
  return jsonError(500, MESSAGES.failed);
}

function rateLimited(windowSeconds: number, now: Date): Response {
  return jsonError(429, MESSAGES.rateLimited, {
    "retry-after": String(retryAfterSeconds(windowSeconds, now)),
  });
}

async function authorize(request: Request, deps: KuroDeps): Promise<Response | null> {
  const now = nowOf(deps);
  const token = readBearerToken(request.headers.get("authorization"));
  const hashes = parseTokenHashes(deps.tokenSha256);

  if (token !== null && hashes.length === 0) {
    return jsonError(500, MESSAGES.failed);
  }

  const accepted = token !== null && bearerTokenMatches(token, hashes);
  if (accepted) {
    return null;
  }

  try {
    await deps.store.pruneKuroRateLimits();
    const globallyAllowed = await deps.store.consumeRateLimit(
      KURO_LIMITS.authFailureGlobal.key,
      KURO_LIMITS.authFailureGlobal.limit,
      KURO_LIMITS.authFailureGlobal.windowSeconds,
    );
    if (!globallyAllowed) {
      return rateLimited(KURO_LIMITS.authFailureGlobal.windowSeconds, now);
    }
    const allowed = await deps.store.consumeRateLimit(
      authFailureKey(clientAddress(request)),
      KURO_LIMITS.authFailure.limit,
      KURO_LIMITS.authFailure.windowSeconds,
    );
    if (!allowed) {
      return rateLimited(KURO_LIMITS.authFailure.windowSeconds, now);
    }
  } catch (error) {
    logFailure(error);
    return jsonError(500, MESSAGES.failed);
  }

  return jsonError(401, MESSAGES.unauthorized, { "www-authenticate": "Bearer" });
}

async function consumeWrite(deps: KuroDeps, now: Date): Promise<Response | null> {
  try {
    await deps.store.pruneKuroRateLimits();
  } catch (error) {
    logFailure(error);
    return jsonError(500, MESSAGES.failed);
  }
  for (const window of [KURO_LIMITS.writeHour, KURO_LIMITS.writeDay]) {
    try {
      const allowed = await deps.store.consumeRateLimit(
        window.key,
        window.limit,
        window.windowSeconds,
      );
      if (!allowed) {
        return rateLimited(window.windowSeconds, now);
      }
    } catch (error) {
      logFailure(error);
      return jsonError(500, MESSAGES.failed);
    }
  }
  return null;
}

function runRevalidate(run: (() => void) | undefined): void {
  if (!run) {
    return;
  }
  try {
    run();
  } catch (error) {
    logFailure(error);
  }
}

function isStatus(value: string): value is ArticleStatus {
  return value === "draft" || value === "published" || value === "unpublished";
}

function isSlot(value: string): value is ArticleSlot {
  return value === "07" || value === "12" || value === "17" || value === "20";
}

function sourceRefs(value: unknown): { id: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const sources: { id: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || !("id" in item) || typeof item.id !== "string") {
      return [];
    }
    sources.push({ id: item.id });
  }
  return sources;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function checkedRefs(value: unknown): { source_ids: string[] }[] {
  if (typeof value !== "object" || value === null || !("checked" in value)) {
    return [];
  }
  const checked = value.checked;
  if (!Array.isArray(checked)) {
    return [];
  }
  const items: { source_ids: string[] }[] = [];
  for (const item of checked) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("source_ids" in item) ||
      !isStringArray(item.source_ids)
    ) {
      return [];
    }
    items.push({ source_ids: item.source_ids });
  }
  return items;
}

function updateContext(row: ArticleRecord): ArticleUpdateContext | null {
  if (!isStatus(row.status) || !isSlot(row.slot)) {
    return null;
  }
  return {
    status: row.status,
    slug: row.slug,
    date: row.date,
    slot: row.slot,
    body_md: row.body_md,
    published_at: row.published_at,
    sources: sourceRefs(row.sources),
    verification: { checked: checkedRefs(row.verification) },
    related: row.related,
  };
}

function toWrite(article: ArticleCreate): ArticleWrite {
  return {
    slug: article.slug,
    title: article.title,
    theme: article.theme,
    slot: article.slot,
    date: article.date,
    status: article.status,
    published_at: article.published_at,
    summary: article.summary,
    body_md: article.body_md,
    sources: article.sources,
    verification: article.verification,
    related: article.related,
  };
}

function toPatch(data: ArticleUpdate): ArticlePatch {
  const patch: ArticlePatch = {};
  for (const key of PATCH_KEYS) {
    if (data[key] !== undefined) {
      patch[key] = data[key] as never;
    }
  }
  return patch;
}

function detailBody(row: ArticleRecord, url: string) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    slot: row.slot,
    date: row.date,
    status: row.status,
    published_at: row.published_at,
    updated_at: row.updated_at,
    summary: row.summary,
    body_md: row.body_md,
    sources: row.sources,
    verification: row.verification,
    related: row.related,
    ai_generated: row.ai_generated,
    author: row.author,
    version: row.version,
    url,
  };
}

export async function handleListArticles(request: Request, deps: KuroDeps): Promise<Response> {
  const denied = await authorize(request, deps);
  if (denied) {
    return denied;
  }

  const days = parseDays(new URL(request.url).searchParams.get("days"));
  if (!days.ok) {
    return jsonBody(400, { errors: [MESSAGES.days] });
  }

  try {
    const articles = await deps.store.listRecent(recentSince(nowOf(deps), days.days));
    return jsonBody(200, { articles });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function handleCreateArticle(request: Request, deps: KuroDeps): Promise<Response> {
  const denied = await authorize(request, deps);
  if (denied) {
    return denied;
  }

  const body = await readJson(request);
  if (!body.ok) {
    return jsonBody(400, { errors: [MESSAGES.invalidArticleJson], warnings: [] });
  }

  const parsed = parseArticleCreate(body.value);
  if (!parsed.success) {
    return jsonBody(400, { errors: parsed.errors, warnings: parsed.warnings });
  }

  try {
    if (parsed.data.status === "published") {
      const existing = await deps.store.findPublishedId(parsed.data.date, parsed.data.slot);
      if (existing) {
        return jsonError(409, MESSAGES.slotConflict);
      }
    }

    const limited = await consumeWrite(deps, nowOf(deps));
    if (limited) {
      return limited;
    }

    const saved = await deps.store.insertArticle(toWrite(parsed.data));
    runRevalidate(() =>
      deps.revalidateArticle?.({
        slug: saved.slug,
        theme: saved.theme,
        date: saved.date,
      }),
    );
    return jsonBody(201, {
      url: articlePublicUrl(saved.slug, deps.siteUrl),
      version: saved.version,
      warnings: parsed.warnings,
    });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function handleGetArticle(
  request: Request,
  slug: string,
  deps: KuroDeps,
): Promise<Response> {
  const denied = await authorize(request, deps);
  if (denied) {
    return denied;
  }

  if (!ARTICLE_SLUG_PATTERN.test(slug)) {
    return jsonError(404, MESSAGES.notFound);
  }

  try {
    const row = await deps.store.findBySlug(slug);
    if (!row) {
      return jsonError(404, MESSAGES.notFound);
    }
    return jsonBody(200, detailBody(row, articlePublicUrl(row.slug, deps.siteUrl)));
  } catch (error) {
    return failureResponse(error);
  }
}

export async function handleUpdateArticle(
  request: Request,
  slug: string,
  deps: KuroDeps,
): Promise<Response> {
  const denied = await authorize(request, deps);
  if (denied) {
    return denied;
  }

  if (!ARTICLE_SLUG_PATTERN.test(slug)) {
    return jsonError(404, MESSAGES.notFound);
  }

  try {
    const current = await deps.store.findBySlug(slug);
    if (!current) {
      return jsonError(404, MESSAGES.notFound);
    }

    const context = updateContext(current);
    if (!context) {
      return jsonError(500, MESSAGES.failed);
    }

    const body = await readJson(request);
    if (!body.ok) {
      return jsonBody(400, { errors: [MESSAGES.invalidArticleJson], warnings: [] });
    }

    const parsed = parseArticleUpdate(body.value, context);
    if (!parsed.success) {
      return jsonBody(400, { errors: parsed.errors, warnings: parsed.warnings });
    }

    const nextStatus = parsed.data.status ?? context.status;
    const nextDate = parsed.data.date ?? context.date;
    const nextSlot = parsed.data.slot ?? context.slot;
    if (nextStatus === "published") {
      const existing = await deps.store.findPublishedId(nextDate, nextSlot);
      if (existing && existing !== current.id) {
        return jsonError(409, MESSAGES.slotConflict);
      }
    }

    const limited = await consumeWrite(deps, nowOf(deps));
    if (limited) {
      return limited;
    }

    const previous = { slug: current.slug, theme: current.theme, date: current.date };
    const saved = await deps.store.updateArticle(current.id, toPatch(parsed.data), {
      changeType: parsed.data.change_type,
      changeNote: parsed.data.change_note ?? null,
      expectedVersion: current.version,
    });
    runRevalidate(() =>
      deps.revalidateArticle?.({
        slug: saved.slug,
        theme: saved.theme,
        date: saved.date,
        previous,
      }),
    );
    return jsonBody(200, {
      url: articlePublicUrl(saved.slug, deps.siteUrl),
      version: saved.version,
      warnings: parsed.warnings,
    });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function handleCreateSkip(request: Request, deps: KuroDeps): Promise<Response> {
  const denied = await authorize(request, deps);
  if (denied) {
    return denied;
  }

  const body = await readJson(request);
  if (!body.ok) {
    return jsonBody(400, { errors: [MESSAGES.invalidSkipJson] });
  }

  const parsed = parseSkip(body.value);
  if (!parsed.ok) {
    return jsonBody(400, { errors: parsed.errors });
  }

  try {
    const limited = await consumeWrite(deps, nowOf(deps));
    if (limited) {
      return limited;
    }

    const saved = await deps.store.insertSkip({
      date: parsed.data.date,
      slot: parsed.data.slot,
      reason: parsed.data.reason,
    });
    runRevalidate(() => deps.revalidateSkip?.(saved.date));
    return jsonBody(201, saved);
  } catch (error) {
    return failureResponse(error);
  }
}
