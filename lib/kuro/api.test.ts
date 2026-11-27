import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { revalidatePath, revalidateTag } from "next/cache";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as articlesRoute from "@/app/api/kuro/articles/route";
import * as slugRoute from "@/app/api/kuro/articles/[slug]/route";
import * as skipsRoute from "@/app/api/kuro/skips/route";
import { ARTICLE_TEXT_LIMITS } from "@/lib/article-schema";
import {
  bearerTokenMatches,
  parseTokenHashes,
  readBearerToken,
  readKuroTokenSha256,
} from "@/lib/kuro/auth";
import { jstDate, recentSince } from "@/lib/kuro/dates";
import {
  handleCreateArticle,
  handleCreateSkip,
  handleGetArticle,
  handleListArticles,
  handleUpdateArticle,
  type KuroDeps,
} from "@/lib/kuro/handlers";
import { authFailureKey, retryAfterSeconds } from "@/lib/kuro/limits";
import { ARTICLE_CACHE_TAG, revalidateArticleSurfaces, revalidateSkipSurfaces } from "@/lib/kuro/revalidate";
import {
  mapDatabaseError,
  SlugConflictError,
  SlotConflictError,
  sourceUrls,
  type ArticlePatch,
  type ArticleRecord,
  type ArticleRevision,
  type ArticleWrite,
  type KuroStore,
} from "@/lib/kuro/store";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const now = new Date("2026-11-30T15:30:00.000Z");
const rateNow = new Date("2026-12-01T00:00:30.000Z");

function articleBody(extra = "", citation = "［1］"): string {
  const head = `告示の要点をまとめる${citation}。${extra}`;
  const count = Array.from(head).length;
  if (count >= ARTICLE_TEXT_LIMITS.body.min) {
    return head;
  }
  return head + "あ".repeat(ARTICLE_TEXT_LIMITS.body.min - count);
}

function validCreate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "福岡市が告示を公開",
    slug: "2026-12-01-07-fukuoka-notice",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    status: "draft",
    ai_generated: true,
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
    verification: {
      checked: [{ claim: "告示が公開された", source_ids: ["1"] }],
      removed: [],
    },
    related: [],
    ...overrides,
  };
}

function makeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function request(
  pathname: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    ip?: string;
    realIp?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init.ip) {
    headers.set("x-forwarded-for", init.ip);
  }
  if (init.realIp) {
    headers.set("x-real-ip", init.realIp);
  }
  return new Request(`http://localhost:3000${pathname}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

class MemoryStore implements KuroStore {
  articles: ArticleRecord[] = [];
  revisions: {
    articleId: string;
    version: number;
    changeType: string;
    note: string | null;
    actor: string;
    title: string;
  }[] = [];
  skips: { date: string; slot: string; reason: string | null }[] = [];
  counts = new Map<string, number>();
  calls: { key: string; limit: number; windowSeconds: number }[] = [];

  async listRecent(sinceDate: string) {
    return this.articles
      .filter((article) => article.date >= sinceDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.slot.localeCompare(a.slot))
      .map((article) => ({
        slug: article.slug,
        title: article.title,
        theme: article.theme,
        slot: article.slot,
        date: article.date,
        status: article.status,
        source_urls: sourceUrls(article.sources),
      }));
  }

  async findBySlug(slug: string) {
    return this.articles.find((article) => article.slug === slug) ?? null;
  }

  async findPublishedId(date: string, slot: string) {
    return (
      this.articles.find(
        (article) => article.date === date && article.slot === slot && article.status === "published",
      )?.id ?? null
    );
  }

  async insertArticle(article: ArticleWrite) {
    if (this.articles.some((row) => row.slug === article.slug)) {
      throw new SlugConflictError();
    }
    if (
      article.status === "published" &&
      this.articles.some(
        (row) => row.date === article.date && row.slot === article.slot && row.status === "published",
      )
    ) {
      throw new SlotConflictError();
    }
    const row: ArticleRecord = {
      ...article,
      id: randomBytes(16).toString("hex"),
      updated_at: "2026-12-01T00:00:00.000Z",
      ai_generated: true,
      author: "kuro",
      version: 1,
    };
    this.articles.push(row);
    return { slug: row.slug, version: row.version, theme: row.theme, date: row.date };
  }

  async updateArticle(id: string, patch: ArticlePatch, revision: ArticleRevision) {
    const row = this.articles.find((article) => article.id === id);
    if (!row) {
      throw new Error("missing");
    }
    this.revisions.push({
      articleId: id,
      version: row.version,
      changeType: revision.changeType,
      note: revision.changeNote,
      actor: "kuro",
      title: row.title,
    });
    Object.assign(row, patch);
    row.version += 1;
    row.author = "kuro";
    return { slug: row.slug, version: row.version, theme: row.theme, date: row.date };
  }

  async insertSkip(input: { date: string; slot: string; reason: string | null }) {
    this.skips.push(input);
    return { id: "skip-1", date: input.date, slot: input.slot, status: "skipped" as const };
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number) {
    this.calls.push({ key, limit, windowSeconds });
    const count = this.counts.get(key) ?? 0;
    if (count >= limit) {
      return false;
    }
    this.counts.set(key, count + 1);
    return true;
  }
}

function deps(
  store: KuroStore,
  tokenHash: string | undefined,
  extra: Partial<KuroDeps> = {},
): KuroDeps {
  return {
    store,
    tokenSha256: tokenHash,
    siteUrl: "http://localhost:3000",
    now,
    ...extra,
  };
}

function sqlState(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

describe("token comparison", () => {
  it("hashes the bearer token and accepts any configured digest", () => {
    const first = makeToken();
    const second = makeToken();
    const hashes = parseTokenHashes(` ${first.hash.toUpperCase()} , not-a-hash, ${second.hash} `);
    expect(bearerTokenMatches(first.token, hashes)).toBe(true);
    expect(bearerTokenMatches(second.token, hashes)).toBe(true);
    expect(bearerTokenMatches(makeToken().token, hashes)).toBe(false);
  });

  it("does not treat the plaintext token as the configured hash", () => {
    const token = randomBytes(32).toString("hex");
    expect(bearerTokenMatches(token, parseTokenHashes(token))).toBe(false);
  });

  it("reads only the Bearer token and ignores other schemes", () => {
    const { token } = makeToken();
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken(`bearer ${token}`)).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it("reads the hash from the environment without a static env access", () => {
    const name = ["KURO", "API", "TOKEN", "SHA256"].join("_");
    const previous = process.env[name];
    process.env[name] = "abc";
    try {
      expect(readKuroTokenSha256()).toBe("abc");
      process.env[name] = "  ";
      expect(readKuroTokenSha256()).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    }
  });
});

describe("kuro api", () => {
  let store: MemoryStore;
  let token: string;
  let hash: string;
  let logged: string[];

  beforeEach(() => {
    store = new MemoryStore();
    const issued = makeToken();
    token = issued.token;
    hash = issued.hash;
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "info").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "debug").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
  });

  function callDeps(extra: Partial<KuroDeps> = {}): KuroDeps {
    return deps(store, hash, extra);
  }

  function expectTokenHidden(body: string): void {
    expect(body).not.toContain(token);
    expect(logged.join("\n")).not.toContain(token);
    expect([...store.counts.keys()].join(" ")).not.toContain(token);
    expect(JSON.stringify(store.articles)).not.toContain(token);
    expect(JSON.stringify(store.revisions)).not.toContain(token);
  }

  it("returns 401 for a missing or wrong token and 201 for the right one", async () => {
    const missing = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), ip: "203.0.113.10" }),
      callDeps(),
    );
    const wrong = await handleCreateArticle(
      request("/api/kuro/articles", {
        body: validCreate(),
        token: makeToken().token,
        ip: "203.0.113.11",
      }),
      callDeps(),
    );
    const created = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), token, ip: "203.0.113.12" }),
      callDeps(),
    );

    const missingBody = await missing.json();
    const wrongBody = await wrong.json();
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missingBody).toEqual(wrongBody);
    expect(missingBody).toEqual({ error: "認証に失敗しました" });
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");
    expect(created.status).toBe(201);
    const payload = await created.json();
    expect(payload).toMatchObject({
      url: "http://localhost:3000/articles/2026-12-01-07-fukuoka-notice",
      version: 1,
      warnings: [],
    });
    expect(store.articles[0]?.author).toBe("kuro");
    expect(store.calls.filter((call) => call.key.startsWith("kuro:write")).map((call) => call.key)).toEqual([
      "kuro:write:hour",
      "kuro:write:day",
    ]);
    expectTokenHidden(JSON.stringify(payload));
  });

  it("rate limits auth failures per address and still accepts the right token", async () => {
    const ip = "203.0.113.20";
    for (let index = 0; index < 10; index += 1) {
      const response = await handleCreateArticle(
        request("/api/kuro/articles", { body: validCreate(), ip }),
        callDeps({ now: rateNow }),
      );
      expect(response.status).toBe(401);
    }

    const blocked = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), token: makeToken().token, ip }),
      callDeps({ now: rateNow }),
    );
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe(String(retryAfterSeconds(60, rateNow)));
    expect(blockedBody).toEqual({ error: "回数の上限を超えています" });

    const otherAddress = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), ip: "203.0.113.21" }),
      callDeps({ now: rateNow }),
    );
    expect(otherAddress.status).toBe(401);

    const allowed = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), token, ip }),
      callDeps({ now: rateNow }),
    );
    expect(allowed.status).toBe(201);
    expect(store.counts.get(authFailureKey(ip))).toBe(10);
    expectTokenHidden(JSON.stringify(blockedBody));
  });

  it("uses x-real-ip ahead of the forwarded list", async () => {
    await handleCreateArticle(
      request("/api/kuro/articles", {
        body: validCreate(),
        ip: "198.51.100.8, 198.51.100.1",
        realIp: "203.0.113.50",
      }),
      callDeps(),
    );
    expect(store.counts.has(authFailureKey("203.0.113.50"))).toBe(true);
    expect(store.counts.has(authFailureKey("198.51.100.8"))).toBe(false);
  });

  it("fails closed when the hash is not configured or the limiter is down", async () => {
    const unconfigured = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), token }),
      deps(store, undefined),
    );
    expect(unconfigured.status).toBe(500);
    expect(store.calls).toEqual([]);

    const missing = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), ip: "203.0.113.60" }),
      deps(store, "   "),
    );
    expect(missing.status).toBe(401);

    store.consumeRateLimit = async () => {
      throw new Error(token);
    };
    const down = await handleCreateArticle(
      request("/api/kuro/articles", { body: validCreate(), ip: "203.0.113.61" }),
      callDeps(),
    );
    const downBody = await down.json();
    expect(down.status).toBe(500);
    expect(downBody).toEqual({ error: "処理に失敗しました" });
    expectTokenHidden(JSON.stringify(downBody));
  });

  it("returns Japanese validation errors and does not consume a write", async () => {
    const response = await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({ title: "", ai_generated: false, author: "kuro" }),
      }),
      callDeps(),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errors.length).toBeGreaterThan(0);
    for (const error of payload.errors) {
      expect(error).toMatch(/^[^：]+：.+/);
    }
    expect(payload.errors.some((error: string) => error.startsWith("title："))).toBe(true);
    expect(payload.errors.some((error: string) => error.startsWith("ai_generated："))).toBe(true);
    expect(payload.errors.some((error: string) => error.startsWith("author："))).toBe(true);
    expect(store.calls.filter((call) => call.key.startsWith("kuro:write"))).toEqual([]);
    expect(store.articles).toEqual([]);
  });

  it("rejects invalid JSON", async () => {
    const response = await handleCreateArticle(
      new Request("http://localhost:3000/api/kuro/articles", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "{",
      }),
      callDeps(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      errors: ["記事：JSONとして読めません"],
      warnings: [],
    });
  });

  it("returns 409 when the published slot is already taken and allows a draft", async () => {
    const published = validCreate({
      status: "published",
      published_at: "2026-12-01T07:00:00+09:00",
    });
    const first = await handleCreateArticle(
      request("/api/kuro/articles", { token, body: published }),
      callDeps(),
    );
    expect(first.status).toBe(201);

    const duplicate = await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({
          slug: "2026-12-01-07-second-note",
          status: "published",
          published_at: "2026-12-01T07:05:00+09:00",
        }),
      }),
      callDeps(),
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "同じ日・同じ枠に公開済みの記事があります",
    });

    const draft = await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({ slug: "2026-12-01-07-draft-note" }),
      }),
      callDeps(),
    );
    expect(draft.status).toBe(201);
  });

  it("returns 409 for a duplicate slug", async () => {
    await handleCreateArticle(request("/api/kuro/articles", { token, body: validCreate() }), callDeps());
    const again = await handleCreateArticle(
      request("/api/kuro/articles", { token, body: validCreate() }),
      callDeps(),
    );
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "同じ slug の記事があります" });
  });

  it("maps a slot conflict that appears during insert", async () => {
    store.findPublishedId = async () => null;
    store.insertArticle = async () => {
      throw new SlotConflictError();
    };
    const racing: KuroStore = store;
    const response = await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({
          status: "published",
          published_at: "2026-12-01T07:00:00+09:00",
        }),
      }),
      deps(racing, hash),
    );
    expect(response.status).toBe(409);
  });

  it("stops the hourly and daily write limits with Retry-After", async () => {
    for (let step = 0; step < 20; step += 1) {
      await store.consumeRateLimit("kuro:write:hour", 20, 3600);
    }
    const hourly = await handleCreateArticle(
      request("/api/kuro/articles", { token, body: validCreate() }),
      callDeps({ now: rateNow }),
    );
    expect(hourly.status).toBe(429);
    expect(hourly.headers.get("retry-after")).toBe("3570");
    expect(store.counts.get("kuro:write:day")).toBeUndefined();

    store.counts.set("kuro:write:hour", 0);
    for (let step = 0; step < 60; step += 1) {
      await store.consumeRateLimit("kuro:write:day", 60, 86400);
    }
    const daily = await handleCreateArticle(
      request("/api/kuro/articles", { token, body: validCreate() }),
      callDeps({ now: rateNow }),
    );
    expect(daily.status).toBe(429);
    expect(daily.headers.get("retry-after")).toBe("86370");
  });

  it("lists recent articles, including drafts and source URLs only", async () => {
    await store.insertArticle({
      ...(validCreate({ slug: "2026-11-17-07-old-note", date: "2026-11-17" }) as ArticleWrite),
    });
    await store.insertArticle({
      ...(validCreate({
        slug: "2026-11-18-20-edge-note",
        date: "2026-11-18",
        slot: "20",
        title: "境界の記事",
      }) as ArticleWrite),
    });
    const created = await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({
          sources: [
            {
              id: "1",
              title: "出してはいけない題",
              publisher: "福岡市",
              url: "https://example.com/notices/1",
              accessed_at: "2026-12-01T06:30:00+09:00",
            },
            {
              id: "2",
              title: "未使用",
              publisher: "福岡市",
              url: "https://example.com/notices/2",
              accessed_at: "2026-12-01T06:40:00+09:00",
            },
          ],
        }),
      }),
      callDeps(),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).warnings).toEqual([
      "sources[1].id：本文の［2］で使われていません",
    ]);

    const response = await handleListArticles(
      request("/api/kuro/articles?days=14", { method: "GET", token }),
      callDeps(),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.articles.map((article: { slug: string }) => article.slug)).toEqual([
      "2026-12-01-07-fukuoka-notice",
      "2026-11-18-20-edge-note",
    ]);
    expect(payload.articles[0].source_urls).toEqual([
      "https://example.com/notices/1",
      "https://example.com/notices/2",
    ]);
    expect(payload.articles[0].status).toBe("draft");
    const text = JSON.stringify(payload);
    expect(text).not.toContain("body_md");
    expect(text).not.toContain("出してはいけない題");
    expect(store.calls.filter((call) => call.key.startsWith("kuro:write"))).toHaveLength(2);

    const invalidDays = await handleListArticles(
      request("/api/kuro/articles?days=0", { method: "GET", token }),
      callDeps(),
    );
    expect(invalidDays.status).toBe(400);
    expect(await invalidDays.json()).toEqual({ errors: ["days：1〜366の整数にしてください"] });
    expect(jstDate(now)).toBe("2026-12-01");
    expect(recentSince(now, 14)).toBe("2026-11-18");
  });

  it("returns one article and 404 for an unknown slug", async () => {
    await handleCreateArticle(request("/api/kuro/articles", { token, body: validCreate() }), callDeps());
    const found = await handleGetArticle(
      request("/api/kuro/articles/2026-12-01-07-fukuoka-notice", { method: "GET", token }),
      "2026-12-01-07-fukuoka-notice",
      callDeps(),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      slug: "2026-12-01-07-fukuoka-notice",
      author: "kuro",
      version: 1,
      status: "draft",
    });

    const missing = await handleGetArticle(
      request("/api/kuro/articles/2026-12-01-12-missing-note", { method: "GET", token }),
      "2026-12-01-12-missing-note",
      callDeps(),
    );
    expect(missing.status).toBe(404);

    const malformed = await handleGetArticle(
      request("/api/kuro/articles/nope", { method: "GET", token }),
      "nope",
      callDeps(),
    );
    expect(malformed.status).toBe(404);
  });

  it("keeps a correction revision and rejects a correction without a note", async () => {
    await handleCreateArticle(request("/api/kuro/articles", { token, body: validCreate() }), callDeps());
    const callsBefore = store.calls.length;
    const missingNote = await handleUpdateArticle(
      request("/api/kuro/articles/2026-12-01-07-fukuoka-notice", {
        method: "PATCH",
        token,
        body: { change_type: "correction", title: "見出しだけ直す" },
      }),
      "2026-12-01-07-fukuoka-notice",
      callDeps(),
    );
    expect(missingNote.status).toBe(400);
    expect(await missingNote.json()).toMatchObject({
      errors: expect.arrayContaining(["change_note：訂正では必須です"]),
    });
    expect(store.revisions).toEqual([]);
    expect(store.calls).toHaveLength(callsBefore);

    const surfaces: unknown[] = [];
    const corrected = await handleUpdateArticle(
      request("/api/kuro/articles/2026-12-01-07-fukuoka-notice", {
        method: "PATCH",
        token,
        body: {
          change_type: "correction",
          change_note: "見出しの数値を訂正",
          title: "福岡市が告示を更新",
          slug: "2026-12-01-07-renamed-note",
        },
      }),
      "2026-12-01-07-fukuoka-notice",
      callDeps({
        revalidateArticle: (surface) => {
          surfaces.push(surface);
        },
      }),
    );
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({
      url: "http://localhost:3000/articles/2026-12-01-07-renamed-note",
      version: 2,
    });
    expect(store.revisions).toEqual([
      {
        articleId: store.articles[0]?.id,
        version: 1,
        changeType: "correction",
        note: "見出しの数値を訂正",
        actor: "kuro",
        title: "福岡市が告示を公開",
      },
    ]);
    expect(surfaces).toEqual([
      {
        slug: "2026-12-01-07-renamed-note",
        theme: "fukuoka",
        date: "2026-12-01",
        previous: {
          slug: "2026-12-01-07-fukuoka-notice",
          theme: "fukuoka",
          date: "2026-12-01",
        },
      },
    ]);
  });

  it("requires a note when updating a published article", async () => {
    await handleCreateArticle(
      request("/api/kuro/articles", {
        token,
        body: validCreate({
          status: "published",
          published_at: "2026-12-01T07:00:00+09:00",
        }),
      }),
      callDeps(),
    );
    const response = await handleUpdateArticle(
      request("/api/kuro/articles/2026-12-01-07-fukuoka-notice", {
        method: "PATCH",
        token,
        body: { change_type: "update", title: "注記なし" },
      }),
      "2026-12-01-07-fukuoka-notice",
      callDeps(),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errors).toContain("change_note：公開済みの記事を更新するときは必須です");
    expect(store.revisions).toEqual([]);
  });

  it("records a skip without returning the reason", async () => {
    const response = await handleCreateSkip(
      request("/api/kuro/skips", {
        token,
        body: { date: "2026-12-01", slot: "12", reason: "一次情報が足りない" },
      }),
      callDeps(),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "skip-1",
      date: "2026-12-01",
      slot: "12",
      status: "skipped",
    });
    expect(store.skips).toEqual([
      { date: "2026-12-01", slot: "12", reason: "一次情報が足りない" },
    ]);
    expect(store.calls.map((call) => call.key)).toEqual(["kuro:write:hour", "kuro:write:day"]);

    const invalid = await handleCreateSkip(
      request("/api/kuro/skips", { token, body: { date: "2026-12-01", slot: "09" } }),
      callDeps(),
    );
    expect(invalid.status).toBe(400);
    const errors = (await invalid.json()).errors as string[];
    expect(errors.some((error) => error.startsWith("slot："))).toBe(true);
  });

  it("hides internal errors and still succeeds if revalidation throws", async () => {
    const response = await handleCreateArticle(
      request("/api/kuro/articles", { token, body: validCreate() }),
      callDeps({
        revalidateArticle: () => {
          throw new Error(token);
        },
      }),
    );
    expect(response.status).toBe(201);
    expectTokenHidden(JSON.stringify(await response.json()));

    store.listRecent = async () => {
      throw new Error(token);
    };
    const failed = await handleListArticles(
      request("/api/kuro/articles", { method: "GET", token }),
      callDeps(),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "処理に失敗しました" });
    expectTokenHidden("");
  });

  it("does not export DELETE and runs on the Node.js runtime", () => {
    expect(articlesRoute.runtime).toBe("nodejs");
    expect(slugRoute.runtime).toBe("nodejs");
    expect(skipsRoute.runtime).toBe("nodejs");
    expect("DELETE" in articlesRoute).toBe(false);
    expect("DELETE" in slugRoute).toBe(false);
    expect("DELETE" in skipsRoute).toBe(false);

    const root = path.resolve(import.meta.dirname, "../..");
    const files = [
      "app/api/kuro/articles/route.ts",
      "app/api/kuro/articles/[slug]/route.ts",
      "app/api/kuro/skips/route.ts",
    ];
    for (const file of files) {
      expect(readFileSync(path.join(root, file), "utf8")).not.toMatch(
        /export\s+(async\s+)?function\s+DELETE/,
      );
    }
    expect(readFileSync(path.join(root, "lib/kuro/auth.ts"), "utf8")).toContain("timingSafeEqual");
  });
});

describe("revalidation", () => {
  it("invalidates the article, home, themes, archive, and feeds immediately", () => {
    revalidateArticleSurfaces({
      slug: "2026-12-01-07-note",
      theme: "fukuoka",
      date: "2026-12-01",
      previous: { slug: "2026-12-01-07-old", theme: "it", date: "2026-11-30" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/articles/2026-12-01-07-note");
    expect(revalidatePath).toHaveBeenCalledWith("/articles/2026-12-01-07-old");
    expect(revalidatePath).toHaveBeenCalledWith("/fukuoka");
    expect(revalidatePath).toHaveBeenCalledWith("/sports");
    expect(revalidatePath).toHaveBeenCalledWith("/archive/2026-12-01");
    expect(revalidatePath).toHaveBeenCalledWith("/archive/2026-11-30");
    expect(revalidatePath).toHaveBeenCalledWith("/corrections");
    expect(revalidatePath).toHaveBeenCalledWith("/feed.xml");
    expect(revalidatePath).toHaveBeenCalledWith("/feed/fukuoka.xml");
    expect(revalidateTag).toHaveBeenCalledWith(ARTICLE_CACHE_TAG, { expire: 0 });

    revalidateSkipSurfaces("2026-12-01");
    expect(revalidatePath).toHaveBeenCalledWith("/archive/2026-12-01");
  });
});

describe("database errors", () => {
  it("maps unique violations without keeping the database message", () => {
    expect(mapDatabaseError("23505", 'duplicate key value violates unique constraint "articles_slug_key"')).toBeInstanceOf(
      SlugConflictError,
    );
    expect(
      mapDatabaseError("23505", 'duplicate key value violates unique constraint "articles_one_published_per_slot"'),
    ).toBeInstanceOf(SlotConflictError);
    expect(mapDatabaseError("23514", "correction requires a note").message).toBe("correction note required");
    expect(mapDatabaseError("XX000", "secret detail").message).toBe("database request failed");
  });
});

const preludeSql = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

alter role service_role bypassrls;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;
`;

describe("kuro api against postgres", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(preludeSql);
    const migrationsDir = path.resolve(import.meta.dirname, "../../supabase/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
      .join("\n\n");
    await db.exec(sql);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec(`
      truncate table
        public.article_revisions,
        public.articles,
        public.slot_logs,
        public.api_rate_limits
    `);
  });

  async function service<T>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    await db.exec("begin");
    try {
      await db.exec("set local role service_role");
      const result = await db.query(text, [...params]);
      await db.exec("commit");
      return result.rows as T[];
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }

  function textArray(values: string[]): string {
    return `{${values
      .map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
      .join(",")}}`;
  }

  function postgresStore(): KuroStore {
    return {
      async listRecent(sinceDate) {
        const rows = await service<{
          slug: string;
          title: string;
          theme: string;
          slot: string;
          date: string;
          status: string;
          sources: { url?: string }[];
        }>(
          `select slug, title, theme, slot, date::text, status, sources
           from public.articles
           where date >= $1::date
           order by date desc, slot desc`,
          [sinceDate],
        );
        return rows.map((row) => ({
          slug: row.slug,
          title: row.title,
          theme: row.theme,
          slot: row.slot,
          date: row.date,
          status: row.status,
          source_urls: sourceUrls(row.sources),
        }));
      },
      async findBySlug(slug) {
        const rows = await service<ArticleRecord>(
          `select id::text, slug, title, theme, slot, date::text, status,
                  published_at::text, updated_at::text, summary, body_md, sources,
                  verification, related, ai_generated, author, version
           from public.articles
           where slug = $1`,
          [slug],
        );
        return rows[0] ?? null;
      },
      async findPublishedId(date, slot) {
        const rows = await service<{ id: string }>(
          `select id::text from public.articles
           where date = $1::date and slot = $2 and status = 'published'`,
          [date, slot],
        );
        return rows[0]?.id ?? null;
      },
      async insertArticle(article) {
        try {
          const rows = await service<{ slug: string; version: number; theme: string; date: string }>(
            `insert into public.articles (
               slug, title, theme, slot, date, status, published_at, summary, body_md,
               sources, verification, related, ai_generated, author
             ) values (
               $1, $2, $3, $4, $5::date, $6, $7::timestamptz, $8::text[], $9,
               $10::jsonb, $11::jsonb, $12::text[], true, 'kuro'
             )
             returning slug, version, theme, date::text`,
            [
              article.slug,
              article.title,
              article.theme,
              article.slot,
              article.date,
              article.status,
              article.published_at,
              textArray(article.summary),
              article.body_md,
              JSON.stringify(article.sources),
              JSON.stringify(article.verification),
              textArray(article.related),
            ],
          );
          const row = rows[0];
          if (!row) {
            throw new Error("insert returned no row");
          }
          return row;
        } catch (error) {
          throw mapDatabaseError(sqlState(error), error instanceof Error ? error.message : "");
        }
      },
      async updateArticle(id: string, patch: ArticlePatch, revision: ArticleRevision) {
        try {
          const rows = await service<{ slug: string; version: number; theme: string; date: string }>(
            `select slug, version, theme, date::text as date
             from public.kuro_apply_article_update($1::uuid, $2::jsonb, $3, $4)`,
            [id, JSON.stringify(patch), revision.changeType, revision.changeNote],
          );
          const row = rows[0];
          if (!row) {
            throw new Error("update returned no row");
          }
          return row;
        } catch (error) {
          throw mapDatabaseError(sqlState(error), error instanceof Error ? error.message : "");
        }
      },
      async insertSkip(input: { date: string; slot: string; reason: string | null }) {
        const rows = await service<{ id: string; date: string; slot: string }>(
          `insert into public.slot_logs (date, slot, status, reason)
           values ($1::date, $2, 'skipped', $3)
           returning id::text, date::text, slot`,
          [input.date, input.slot, input.reason],
        );
        const row = rows[0];
        if (!row) {
          throw new Error("skip returned no row");
        }
        return { ...row, status: "skipped" };
      },
      async consumeRateLimit(key, limit, windowSeconds) {
        const rows = await service<{ ok: boolean }>(
          `select public.consume_rate_limit($1, $2, $3) as ok`,
          [key, limit, windowSeconds],
        );
        return rows[0]?.ok === true;
      },
    };
  }

  it("creates and corrects through the trigger, and cannot delete", async () => {
    const issued = makeToken();
    const store = postgresStore();
    const options = deps(store, issued.hash, { now });
    const created = await handleCreateArticle(
      request("/api/kuro/articles", { token: issued.token, body: validCreate() }),
      options,
    );
    expect(created.status).toBe(201);
    expect((await created.json()).version).toBe(1);

    const stored = await db.query<{ author: string; version: number }>(
      `select author, version from public.articles`,
    );
    expect(stored.rows).toEqual([{ author: "kuro", version: 1 }]);

    const corrected = await handleUpdateArticle(
      request("/api/kuro/articles/2026-12-01-07-fukuoka-notice", {
        method: "PATCH",
        token: issued.token,
        body: {
          change_type: "correction",
          change_note: "見出しの数値を訂正",
          title: "福岡市が告示を更新",
        },
      }),
      "2026-12-01-07-fukuoka-notice",
      options,
    );
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({ version: 2 });

    const revision = await db.query<{
      change_type: string;
      note: string;
      actor: string;
      version: number;
      previous_title: string;
    }>(
      `select change_type, note, actor, version, snapshot->>'title' as previous_title
       from public.article_revisions`,
    );
    expect(revision.rows).toEqual([
      {
        change_type: "correction",
        note: "見出しの数値を訂正",
        actor: "kuro",
        version: 1,
        previous_title: "福岡市が告示を公開",
      },
    ]);

    const current = await db.query<{ title: string; version: number }>(
      `select title, version from public.articles`,
    );
    expect(current.rows).toEqual([{ title: "福岡市が告示を更新", version: 2 }]);

    const id = await db.query<{ id: string }>(`select id::text from public.articles`);
    await expect(
      service(`delete from public.articles where id = $1::uuid`, [id.rows[0]?.id]),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === "42501");
    const stillThere = await db.query<{ count: number }>(`select count(*)::int as count from public.articles`);
    expect(stillThere.rows[0]?.count).toBe(1);
  });

  it("rolls back a correction without a note and keeps execute on service_role", async () => {
    const issued = makeToken();
    const created = await handleCreateArticle(
      request("/api/kuro/articles", { token: issued.token, body: validCreate() }),
      deps(postgresStore(), issued.hash, { now }),
    );
    expect(created.status).toBe(201);
    const id = await db.query<{ id: string }>(`select id::text from public.articles`);

    await expect(
      service(
        `select * from public.kuro_apply_article_update($1::uuid, $2::jsonb, 'correction', '   ')`,
        [id.rows[0]?.id, JSON.stringify({ title: "失敗" })],
      ),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === "23514");

    const unchanged = await db.query<{ title: string }>(`select title from public.articles`);
    expect(unchanged.rows[0]?.title).toBe("福岡市が告示を公開");
    const revisions = await db.query<{ count: number }>(
      `select count(*)::int as count from public.article_revisions`,
    );
    expect(revisions.rows[0]?.count).toBe(0);

    await db.exec("begin");
    await db.exec("set local role anon");
    await expect(
      db.query(`select * from public.kuro_apply_article_update($1::uuid, '{}'::jsonb, 'update', null)`, [
        id.rows[0]?.id,
      ]),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === "42501");
    await db.exec("rollback");

    const grantees = await db.query<{ grantee: string }>(
      `select grantee
       from information_schema.routine_privileges
       where routine_schema = 'public'
         and routine_name = 'kuro_apply_article_update'
         and privilege_type = 'EXECUTE'`,
    );
    const names = grantees.rows.map((row) => row.grantee);
    expect(names).toContain("service_role");
    expect(names).not.toContain("anon");
    expect(names).not.toContain("PUBLIC");
  });

  it("returns 409 for a second published article in the same slot", async () => {
    const issued = makeToken();
    const options = deps(postgresStore(), issued.hash, { now });
    const first = await handleCreateArticle(
      request("/api/kuro/articles", {
        token: issued.token,
        body: validCreate({
          status: "published",
          published_at: "2026-12-01T07:00:00+09:00",
        }),
      }),
      options,
    );
    expect(first.status).toBe(201);
    const second = await handleCreateArticle(
      request("/api/kuro/articles", {
        token: issued.token,
        body: validCreate({
          slug: "2026-12-01-07-second-note",
          status: "published",
          published_at: "2026-12-01T07:05:00+09:00",
        }),
      }),
      options,
    );
    expect(second.status).toBe(409);
  });
});
