import {
  parseArticleCreate,
  parseArticleUpdate,
  type ArticleSlot,
  type ArticleStatus,
  type ArticleUpdate,
  type ArticleUpdateContext,
} from "@/lib/article-schema";
import { groupFieldErrors, type ArticleFormInput } from "@/lib/admin/form";
import { isTrustedMutationOrigin } from "@/lib/admin/gate";
import { CSRF_MESSAGE } from "@/lib/admin/login";
import { buildArticlePreview } from "@/lib/admin/preview";
import { MESSAGES } from "@/lib/kuro/http";
import type { ArticleSurface } from "@/lib/kuro/revalidate";
import {
  ArticleNotFoundError,
  RevisionNoteError,
  SlugConflictError,
  SlotConflictError,
  StaleArticleError,
  type ArticlePatch,
  type ArticleWrite,
} from "@/lib/kuro/store";
import type { PublicArticle } from "@/lib/articles/public";

export type EditableArticle = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  slot: string;
  date: string;
  status: string;
  published_at: string | null;
  body_md: string;
  summary: string[];
  sources: unknown;
  verification: unknown;
  related: string[];
  author: string;
  version: number;
};

export type AdminWriteStore = {
  insertArticle(article: ArticleWrite): Promise<{ slug: string; theme: string; date: string }>;
  updateArticle(
    id: string,
    patch: ArticlePatch,
    revision: { changeType: string; changeNote: string | null; expectedVersion: number },
  ): Promise<{ slug: string; theme: string; date: string }>;
  findPublishedId(date: string, slot: string): Promise<string | null>;
};

export type ArticleFormState = {
  errors: string[];
  warnings: string[];
  fieldErrors: Record<string, string[]>;
  preview: PublicArticle | null;
};

export const EMPTY_FORM_STATE: ArticleFormState = {
  errors: [],
  warnings: [],
  fieldErrors: {},
  preview: null,
};

export type SubmissionResult =
  | { kind: "csrf" }
  | { kind: "login" }
  | { kind: "deny" }
  | { kind: "invalid"; state: ArticleFormState }
  | { kind: "preview"; state: ArticleFormState }
  | { kind: "saved"; slug: string; warnings: string[] };

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

function stateOf(errors: string[], warnings: string[], preview: PublicArticle | null): ArticleFormState {
  const grouped = groupFieldErrors(errors);
  return {
    errors,
    warnings,
    fieldErrors: grouped.fieldErrors,
    preview,
  };
}

function isStatus(value: string): value is ArticleStatus {
  return value === "draft" || value === "published" || value === "unpublished";
}

function isSlot(value: string): value is ArticleSlot {
  return value === "07" || value === "12" || value === "17" || value === "20";
}

function sourceRefs(value: unknown): { id: string }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const sources: { id: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || !("id" in item) || typeof item.id !== "string") {
      return null;
    }
    sources.push({ id: item.id });
  }
  return sources;
}

function checkedRefs(value: unknown): { source_ids: string[] }[] | null {
  if (typeof value !== "object" || value === null || !("checked" in value) || !Array.isArray(value.checked)) {
    return null;
  }
  const items: { source_ids: string[] }[] = [];
  for (const item of value.checked) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("source_ids" in item) ||
      !Array.isArray(item.source_ids)
    ) {
      return null;
    }
    const ids = item.source_ids.filter((id: unknown): id is string => typeof id === "string");
    if (ids.length !== item.source_ids.length) return null;
    items.push({ source_ids: ids });
  }
  return items;
}

function updateContext(article: EditableArticle): ArticleUpdateContext | null {
  const sources = sourceRefs(article.sources);
  const checked = checkedRefs(article.verification);
  if (!isStatus(article.status) || !isSlot(article.slot) || !sources || !checked) {
    return null;
  }
  return {
    status: article.status,
    slug: article.slug,
    date: article.date,
    slot: article.slot,
    body_md: article.body_md,
    published_at: article.published_at,
    sources,
    verification: { checked },
    related: article.related,
  };
}

function content(form: ArticleFormInput) {
  return {
    title: form.title,
    slug: form.slug,
    theme: form.theme,
    slot: form.slot,
    date: form.date,
    summary: form.summary,
    body_md: form.body_md,
    sources: form.sources,
    verification: { checked: form.checked, removed: form.removed },
    related: form.related,
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

function failureMessage(error: unknown): string {
  if (error instanceof SlotConflictError) {
    return MESSAGES.slotConflict;
  }
  if (error instanceof SlugConflictError) {
    return MESSAGES.slugConflict;
  }
  if (error instanceof ArticleNotFoundError) {
    return MESSAGES.notFound;
  }
  if (error instanceof RevisionNoteError) {
    return "change_note：訂正では必須です";
  }
  if (error instanceof StaleArticleError) {
    return MESSAGES.staleArticle;
  }
  console.error(`admin save ${error instanceof Error ? error.name : "Error"}`);
  return MESSAGES.failed;
}

async function slotTaken(
  store: AdminWriteStore,
  date: string,
  slot: string,
  selfId: string | null,
): Promise<boolean> {
  const existing = await store.findPublishedId(date, slot);
  return existing !== null && existing !== selfId;
}

export async function handleAdminSubmission(input: {
  origin: string | null;
  host: string | null;
  gate: "allow" | "login" | "deny";
  mode: "create" | "edit";
  current: EditableArticle | null;
  form: ArticleFormInput;
  now: Date;
  store: AdminWriteStore;
  revalidate: (surface: ArticleSurface) => void;
}): Promise<SubmissionResult> {
  if (!isTrustedMutationOrigin(input.origin, input.host)) {
    return { kind: "csrf" };
  }
  if (input.gate === "login") {
    return { kind: "login" };
  }
  if (input.gate === "deny") {
    return { kind: "deny" };
  }

  const form = input.form;
  if (form.intent === "unknown") {
    return { kind: "invalid", state: stateOf(["記事：操作を確認してください"], [], null) };
  }

  const preview =
    form.intent === "preview"
      ? await buildArticlePreview({
          title: form.title,
          slug: form.slug,
          theme: form.theme,
          summary: form.summary,
          body_md: form.body_md,
          sources: form.sources,
          verification: { checked: form.checked, removed: form.removed },
          now: input.now,
        })
      : null;

  if (input.mode === "create") {
    if (form.intent === "unpublish") {
      return { kind: "invalid", state: stateOf(["status：未作成の記事は非公開にできません"], [], preview) };
    }

    const creating = {
      ...content(form),
      ai_generated: true as const,
      status: form.intent === "publish" ? ("published" as const) : ("draft" as const),
      published_at: form.intent === "publish" ? input.now.toISOString() : null,
    };
    const parsed = parseArticleCreate(creating);
    if (!parsed.success) {
      return {
        kind: preview ? "preview" : "invalid",
        state: stateOf(parsed.errors, parsed.warnings, preview),
      };
    }

    if (form.intent === "preview") {
      return { kind: "preview", state: stateOf([], parsed.warnings, preview) };
    }

    if (parsed.data.status === "published") {
      const taken = await slotTaken(input.store, parsed.data.date, parsed.data.slot, null);
      if (taken) {
        return { kind: "invalid", state: stateOf([MESSAGES.slotConflict], parsed.warnings, null) };
      }
    }

    try {
      const saved = await input.store.insertArticle({
        slug: parsed.data.slug,
        title: parsed.data.title,
        theme: parsed.data.theme,
        slot: parsed.data.slot,
        date: parsed.data.date,
        status: parsed.data.status,
        published_at: parsed.data.published_at,
        summary: parsed.data.summary,
        body_md: parsed.data.body_md,
        sources: parsed.data.sources,
        verification: parsed.data.verification,
        related: parsed.data.related,
      });
      input.revalidate({ slug: saved.slug, theme: saved.theme, date: saved.date });
      return { kind: "saved", slug: saved.slug, warnings: parsed.warnings };
    } catch (error) {
      return { kind: "invalid", state: stateOf([failureMessage(error)], parsed.warnings, null) };
    }
  }

  if (!input.current) {
    return { kind: "invalid", state: stateOf([MESSAGES.notFound], [], preview) };
  }

  if (form.intent !== "preview" && (form.expectedVersion === null || form.expectedVersion !== input.current.version)) {
    return { kind: "invalid", state: stateOf([MESSAGES.staleArticle], [], preview) };
  }

  const context = updateContext(input.current);
  if (!context) {
    return { kind: "invalid", state: stateOf(["記事：保存済みの形式を確認できませんでした"], [], preview) };
  }

  if (form.intent === "publish" && context.status === "published") {
    return { kind: "invalid", state: stateOf(["status：すでに公開しています"], [], preview) };
  }
  if (form.intent === "unpublish" && context.status === "unpublished") {
    return { kind: "invalid", state: stateOf(["status：すでに非公開です"], [], preview) };
  }

  let changeType: ArticleUpdate["change_type"];
  if (form.intent === "publish") {
    changeType = "publish";
  } else if (form.intent === "unpublish") {
    changeType = "unpublish";
  } else if (form.intent === "preview") {
    changeType = form.changeKind === "correction" ? "correction" : "update";
  } else if (context.status === "published") {
    if (form.changeKind !== "update" && form.changeKind !== "correction") {
      return {
        kind: preview ? "preview" : "invalid",
        state: stateOf(["change_type：訂正か軽微な修正を選んでください"], [], preview),
      };
    }
    changeType = form.changeKind;
  } else {
    changeType = "update";
  }

  const note = form.changeNote.length > 0 ? form.changeNote : undefined;
  const update: Record<string, unknown> = {
    ...content(form),
    ai_generated: true,
    change_type: changeType,
    ...(note !== undefined ? { change_note: note } : {}),
  };

  if (form.intent === "publish") {
    update.status = "published";
    update.published_at = context.published_at ?? input.now.toISOString();
  } else if (form.intent === "unpublish") {
    update.status = "unpublished";
  }

  const parsed = parseArticleUpdate(update, context);
  if (!parsed.success) {
    return {
      kind: preview ? "preview" : "invalid",
      state: stateOf(parsed.errors, parsed.warnings, preview),
    };
  }

  if (form.intent === "preview") {
    return { kind: "preview", state: stateOf([], parsed.warnings, preview) };
  }

  const nextStatus = parsed.data.status ?? context.status;
  const nextDate = parsed.data.date ?? context.date;
  const nextSlot = parsed.data.slot ?? context.slot;
  if (nextStatus === "published") {
    const taken = await slotTaken(input.store, nextDate, nextSlot, input.current.id);
    if (taken) {
      return { kind: "invalid", state: stateOf([MESSAGES.slotConflict], parsed.warnings, null) };
    }
  }

  if (form.expectedVersion === null) {
    return { kind: "invalid", state: stateOf([MESSAGES.staleArticle], parsed.warnings, null) };
  }

  try {
    const saved = await input.store.updateArticle(input.current.id, toPatch(parsed.data), {
      changeType: parsed.data.change_type,
      changeNote: parsed.data.change_note ?? null,
      expectedVersion: form.expectedVersion,
    });
    input.revalidate({
      slug: saved.slug,
      theme: saved.theme,
      date: saved.date,
      previous: {
        slug: input.current.slug,
        theme: input.current.theme,
        date: input.current.date,
      },
    });
    return { kind: "saved", slug: saved.slug, warnings: parsed.warnings };
  } catch (error) {
    return { kind: "invalid", state: stateOf([failureMessage(error)], parsed.warnings, null) };
  }
}

export { CSRF_MESSAGE };
