import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ARTICLE_TEXT_LIMITS } from "@/lib/article-schema";
import {
  authorizeAdminAction,
  decideProxyAccess,
  isTrustedMutationOrigin,
  safeAdminNext,
} from "@/lib/admin/gate";
import { draftFromArticle } from "@/lib/admin/draft";
import { MAX_FORM_ROWS, parseArticleForm } from "@/lib/admin/form";
import { normalizeLoginEmail, performMagicLinkRequest } from "@/lib/admin/login";
import { buildAdminSlots } from "@/lib/admin/queries";
import { actorLabel, revisionViews } from "@/lib/admin/revisions";
import { handleAdminSubmission, type AdminWriteStore, type EditableArticle } from "@/lib/admin/submit";
import type { ArticleFormInput } from "@/lib/admin/form";

const root = path.resolve(import.meta.dirname, "../..");

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...filesUnder(full));
      continue;
    }
    if (/\.(ts|tsx|md)$/.test(entry) && !entry.endsWith(".test.ts")) {
      found.push(full);
    }
  }
  return found;
}

function articleBody(): string {
  const head = "告示の要点をまとめる［1］。";
  const count = Array.from(head).length;
  return head + "あ".repeat(ARTICLE_TEXT_LIMITS.body.min - count);
}

function form(overrides: Partial<ArticleFormInput> = {}): ArticleFormInput {
  return {
    title: "福岡市が告示を公開",
    slug: "2026-12-01-07-fukuoka-notice",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    body_md: articleBody(),
    sources: [
      {
        id: "1",
        title: "告示",
        publisher: "福岡市",
        url: "https://example.com/notices/1",
        accessed_at: "2026-12-01T06:30:00+09:00",
      },
    ],
    checked: [{ claim: "告示が公開された", source_ids: ["1"] }],
    removed: [],
    related: [],
    changeKind: "update",
    changeNote: "",
    intent: "save",
    ...overrides,
  };
}

function publishedArticle(): EditableArticle {
  const input = form();
  return {
    id: "article-1",
    slug: input.slug,
    title: input.title,
    theme: input.theme,
    slot: input.slot,
    date: input.date,
    status: "published",
    published_at: "2026-12-01T07:00:00+09:00",
    body_md: input.body_md,
    summary: [...input.summary],
    sources: input.sources,
    verification: { checked: input.checked, removed: [] },
    related: [],
    author: "kuro",
    version: 1,
  };
}

function memoryStore(): AdminWriteStore & {
  insertArticle: ReturnType<typeof vi.fn>;
  updateArticle: ReturnType<typeof vi.fn>;
  findPublishedId: ReturnType<typeof vi.fn>;
} {
  return {
    insertArticle: vi.fn(async (article) => ({
      slug: article.slug,
      theme: article.theme,
      date: article.date,
    })),
    updateArticle: vi.fn(async () => ({
      slug: "2026-12-01-07-fukuoka-notice",
      theme: "fukuoka",
      date: "2026-12-01",
    })),
    findPublishedId: vi.fn(async () => null),
  };
}

const trusted = { origin: "https://news.example", host: "news.example" };

describe("admin access", () => {
  it("redirects anonymous visitors away from /admin", () => {
    expect(
      decideProxyAccess({
        pathname: "/admin",
        search: "",
        configured: true,
        hasSession: false,
        allowlisted: false,
      }),
    ).toEqual({ type: "redirect", next: "/admin" });
    expect(
      decideProxyAccess({
        pathname: "/admin/articles/new",
        search: "",
        configured: true,
        hasSession: false,
        allowlisted: false,
      }).type,
    ).toBe("redirect");
    expect(
      decideProxyAccess({
        pathname: "/",
        search: "",
        configured: true,
        hasSession: false,
        allowlisted: false,
      }),
    ).toEqual({ type: "continue" });
    expect(
      decideProxyAccess({
        pathname: "/admin/login",
        search: "",
        configured: true,
        hasSession: false,
        allowlisted: false,
      }),
    ).toEqual({ type: "continue" });
  });

  it("signs out a session that is not on the allowlist", () => {
    expect(
      decideProxyAccess({
        pathname: "/admin",
        search: "",
        configured: true,
        hasSession: true,
        allowlisted: false,
      }),
    ).toEqual({ type: "sign-out" });
    expect(
      authorizeAdminAction({
        configured: true,
        authenticated: true,
        allowlisted: false,
      }),
    ).toBe("deny");
    expect(
      decideProxyAccess({
        pathname: "/admin",
        search: "",
        configured: true,
        hasSession: true,
        allowlisted: true,
      }),
    ).toEqual({ type: "continue" });
  });

  it("fails closed when Supabase is not configured", () => {
    expect(
      decideProxyAccess({
        pathname: "/admin/articles/example",
        search: "",
        configured: false,
        hasSession: false,
        allowlisted: false,
      }).type,
    ).toBe("redirect");
  });

  it("rejects external next paths", () => {
    expect(safeAdminNext("https://evil.example/admin")).toBe("/admin");
    expect(safeAdminNext("//evil.example")).toBe("/admin");
    expect(safeAdminNext("/admin/login")).toBe("/admin");
    expect(safeAdminNext("/admin/articles/2026-12-01-07-note")).toBe(
      "/admin/articles/2026-12-01-07-note",
    );
  });
});

describe("magic link request", () => {
  it("uses the same result for allowlisted and other addresses", async () => {
    const send = vi.fn(async () => undefined);
    const lookup = vi.fn(async (email: string) => email === "admin@example.com");

    const denied = await performMagicLinkRequest({
      ...trusted,
      email: "visitor@example.com",
      next: "/admin/articles/new",
      redirectTo: "https://news.example/auth/callback",
      lookup,
      send,
    });
    const allowed = await performMagicLinkRequest({
      ...trusted,
      email: "admin@example.com",
      next: "/admin",
      redirectTo: "https://news.example/auth/callback",
      lookup,
      send,
    });

    expect(denied.status).toBe("sent");
    expect(allowed.status).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("admin@example.com");
  });

  it("does not send when the origin is foreign or the address is not an email", async () => {
    const send = vi.fn();
    const lookup = vi.fn();
    const foreign = await performMagicLinkRequest({
      origin: "https://evil.example",
      host: "news.example",
      email: "admin@example.com",
      next: null,
      redirectTo: "https://news.example/auth/callback",
      lookup,
      send,
    });
    const invalid = await performMagicLinkRequest({
      ...trusted,
      email: "not-an-email",
      next: null,
      redirectTo: "https://news.example/auth/callback",
      lookup,
      send,
    });

    expect(foreign.status).toBe("forbidden");
    expect(invalid.status).toBe("invalid");
    expect(lookup).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(normalizeLoginEmail("  Admin@Example.com ")).toBe("admin@example.com");
  });

  it("keeps the sent result when delivery fails", async () => {
    const result = await performMagicLinkRequest({
      ...trusted,
      email: "admin@example.com",
      next: null,
      redirectTo: "https://news.example/auth/callback",
      lookup: async () => true,
      send: async () => {
        throw new Error("otp failed");
      },
    });
    expect(result.status).toBe("sent");
  });
});

describe("article admin mutations", () => {
  it("rejects a cross-site post before writing", async () => {
    const store = memoryStore();
    const result = await handleAdminSubmission({
      origin: "https://evil.example",
      host: "news.example",
      gate: "allow",
      mode: "create",
      current: null,
      form: form({ intent: "publish" }),
      now: new Date("2026-12-01T00:00:00.000Z"),
      store,
      revalidate: vi.fn(),
    });
    expect(result.kind).toBe("csrf");
    expect(store.insertArticle).not.toHaveBeenCalled();
    expect(isTrustedMutationOrigin(null, "news.example")).toBe(false);
  });

  it("does not write for anonymous or non-allowlisted callers", async () => {
    const store = memoryStore();
    const anonymous = await handleAdminSubmission({
      ...trusted,
      gate: "login",
      mode: "create",
      current: null,
      form: form(),
      now: new Date("2026-12-01T00:00:00.000Z"),
      store,
      revalidate: vi.fn(),
    });
    const outsider = await handleAdminSubmission({
      ...trusted,
      gate: "deny",
      mode: "edit",
      current: publishedArticle(),
      form: form({ changeKind: "correction", changeNote: "数値を直した", title: "訂正後" }),
      now: new Date("2026-12-01T00:00:00.000Z"),
      store,
      revalidate: vi.fn(),
    });
    expect(anonymous.kind).toBe("login");
    expect(outsider.kind).toBe("deny");
    expect(store.insertArticle).not.toHaveBeenCalled();
    expect(store.updateArticle).not.toHaveBeenCalled();
  });

  it("creates, edits, and publishes through the shared schema", async () => {
    const store = memoryStore();
    const revalidate = vi.fn();
    const now = new Date("2026-12-01T00:00:00.000Z");

    const invalid = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "create",
      current: null,
      form: form({ title: "" }),
      now,
      store,
      revalidate,
    });
    expect(invalid.kind).toBe("invalid");
    if (invalid.kind === "invalid") {
      expect(invalid.state.errors.some((error) => error.startsWith("title："))).toBe(true);
      expect(invalid.state.fieldErrors.title?.length).toBeGreaterThan(0);
    }
    expect(store.insertArticle).not.toHaveBeenCalled();

    const created = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "create",
      current: null,
      form: form({ intent: "publish" }),
      now,
      store,
      revalidate,
    });
    expect(created.kind).toBe("saved");
    expect(store.insertArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        published_at: now.toISOString(),
        slug: "2026-12-01-07-fukuoka-notice",
      }),
    );
    expect(revalidate).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "2026-12-01-07-fukuoka-notice", theme: "fukuoka" }),
    );

    const draft = publishedArticle();
    draft.status = "draft";
    draft.published_at = null;
    const edited = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "edit",
      current: draft,
      form: form({ title: "見出しを整えた" }),
      now,
      store,
      revalidate,
    });
    expect(edited.kind).toBe("saved");
    expect(store.updateArticle).toHaveBeenCalledWith(
      "article-1",
      expect.objectContaining({ title: "見出しを整えた" }),
      { changeType: "update", changeNote: null, expectedVersion: 1 },
    );

    const published = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "edit",
      current: draft,
      form: form({ intent: "publish" }),
      now,
      store,
      revalidate,
    });
    expect(published.kind).toBe("saved");
    expect(store.updateArticle).toHaveBeenLastCalledWith(
      "article-1",
      expect.objectContaining({ status: "published" }),
      expect.objectContaining({ changeType: "publish" }),
    );
  });

  it("requires a change note for a correction", async () => {
    const store = memoryStore();
    const missing = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "edit",
      current: publishedArticle(),
      form: form({ changeKind: "correction", changeNote: "", title: "訂正後" }),
      now: new Date("2026-12-01T00:00:00.000Z"),
      store,
      revalidate: vi.fn(),
    });
    expect(missing.kind).toBe("invalid");
    if (missing.kind === "invalid") {
      expect(missing.state.errors).toContain("change_note：訂正では必須です");
      expect(missing.state.fieldErrors.change_note).toEqual(["訂正では必須です"]);
    }
    expect(store.updateArticle).not.toHaveBeenCalled();

    const saved = await handleAdminSubmission({
      ...trusted,
      gate: "allow",
      mode: "edit",
      current: publishedArticle(),
      form: form({ changeKind: "correction", changeNote: "数値を直した", title: "訂正後" }),
      now: new Date("2026-12-01T00:00:00.000Z"),
      store,
      revalidate: vi.fn(),
    });
    expect(saved.kind).toBe("saved");
    expect(store.updateArticle).toHaveBeenCalledWith(
      "article-1",
      expect.objectContaining({ title: "訂正後" }),
      { changeType: "correction", changeNote: "数値を直した", expectedVersion: 1 },
    );
  });

  it("does not take ai_generated from the form", () => {
    const data = new FormData();
    data.set("ai_generated", "false");
    data.set("title", "見出し");
    data.set("intent", "save");
    const parsed = parseArticleForm(data);
    expect(parsed.ok && parsed.value).not.toHaveProperty("ai_generated");
    const source = readFileSync(path.join(root, "lib/admin/store.ts"), "utf8");
    expect(source).toContain("ai_generated: true");
    expect(source).toContain('rpc("kuro_apply_article_update"');
    expect(source).not.toContain(".delete(");
  });

  it("keeps every submitted row and rejects a count past the form limit", () => {
    const kept = new FormData();
    kept.set("source_count", "21");
    kept.set("checked_count", "1");
    kept.set("removed_count", "0");
    for (let index = 0; index < 21; index += 1) {
      kept.set(`source_${index}_id`, String(index + 1));
    }
    const parsed = parseArticleForm(kept);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sources).toHaveLength(21);
      expect(parsed.value.sources[20]?.id).toBe("21");
    }

    const over = new FormData();
    over.set("source_count", String(MAX_FORM_ROWS + 1));
    over.set("checked_count", "1");
    over.set("removed_count", String(MAX_FORM_ROWS + 5));
    const rejected = parseArticleForm(over);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors).toEqual([
        `sources：${MAX_FORM_ROWS}件までです`,
        `verification：外した点は${MAX_FORM_ROWS}件までです`,
      ]);
      expect(JSON.stringify(rejected)).not.toContain(`source_${MAX_FORM_ROWS}_id`);
    }

    const sources = Array.from({ length: 25 }, (_, index) => ({
      id: String(index + 1),
      title: "題",
      publisher: "発行",
      url: "https://example.com/source",
      accessed_at: "2026-12-01T07:00:00+09:00",
    }));
    const draft = draftFromArticle({
      title: "見出し",
      slug: "2026-12-01-07-note",
      theme: "fukuoka",
      slot: "07",
      date: "2026-12-01",
      status: "draft",
      summary: ["一", "二", "三"],
      body_md: "本文",
      sources,
      verification: { checked: sources.map((source) => ({ claim: source.id, source_ids: [source.id] })), removed: [] },
      related: [],
    });
    expect(draft.sources).toHaveLength(25);
    expect(draft.checked).toHaveLength(25);
  });
});

describe("admin revisions and slots", () => {
  it("labels actors without showing the raw id", () => {
    const adminId = "22222222-2222-4222-8222-222222222222";
    expect(actorLabel("kuro")).toBe("クロ");
    expect(actorLabel(`admin:${adminId}`)).toBe("管理者");
    const views = revisionViews({
      current: { title: "訂正後", body_md: "新しい本文", author: "kuro" },
      revisions: [
        {
          id: "rev-1",
          version: 1,
          snapshot: { title: "旧見出し", body_md: "古い本文", author: "kuro" },
          change_type: "correction",
          note: "数値を直した",
          actor: `admin:${adminId}`,
          created_at: "2026-12-01T07:00:00+09:00",
        },
      ],
    });
    expect(views[0]?.actorLabel).toBe("管理者");
    expect(JSON.stringify(views)).not.toContain(adminId);
    expect(views[0]?.changes.some((change) => change.field === "作成")).toBe(false);
    expect(views[0]?.changes.some((change) => change.field === "見出し")).toBe(true);
    expect(views[0]?.changes.some((change) => change.text.includes("- 古い本文"))).toBe(true);

    const authorChange = revisionViews({
      current: { author: "admin" },
      revisions: [
        {
          id: "rev-2",
          version: 1,
          snapshot: { author: "kuro" },
          change_type: "update",
          note: null,
          actor: "kuro",
          created_at: "2026-12-01T07:00:00+09:00",
        },
      ],
    });
    const authorText = authorChange[0]?.changes.find((change) => change.field === "作成")?.text ?? "";
    expect(authorText).toContain("クロ");
    expect(authorText).toContain("管理者");
    expect(authorText).not.toContain("（なし）");
  });

  it("prefers a published article over an empty slot", () => {
    const slots = buildAdminSlots({
      articles: [{ slug: "2026-12-01-07-note", title: "朝刊", slot: "07", status: "draft" }],
      skips: [{ slot: "12" }],
    });
    expect(slots.map((slot) => slot.label)).toEqual([
      "下書き",
      "この枠は見送りました",
      "まだありません",
      "まだありません",
    ]);
  });
});

describe("admin source boundaries", () => {
  it("keeps mutations on server actions and out of delete calls", () => {
    const action = readFileSync(path.join(root, "app/admin/actions.ts"), "utf8");
    expect(action).toContain('"use server"');
    expect(action).toContain("isTrustedMutationOrigin");
    expect(action).toContain("readAdminSession");
    expect(action).toContain("revalidateArticleSurfaces");
    expect(action).toContain("shouldCreateUser: false");
    expect(action).not.toContain(".delete(");

    const submit = readFileSync(path.join(root, "lib/admin/submit.ts"), "utf8");
    expect(submit).toContain("parseArticleCreate");
    expect(submit).toContain("parseArticleUpdate");
    expect(submit).not.toContain(".delete(");

    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const offenders = [...filesUnder(path.join(root, "app/admin")), ...filesUnder(path.join(root, "lib/admin"))]
      .filter((file) => email.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
