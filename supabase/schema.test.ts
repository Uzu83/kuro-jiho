import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const migrationsDir = path.join(import.meta.dirname, "migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n\n");

const adminId = "22222222-2222-4222-8222-222222222222";
const outsiderId = "11111111-1111-4111-8111-111111111111";

const tables = [
  "admin_allowlist",
  "api_rate_limits",
  "article_revisions",
  "articles",
  "slot_logs",
] as const;

type RoleName = "anon" | "authenticated" | "service_role";

type Sql = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
) => Promise<{ rows: T[]; rowCount: number }>;

type Db = {
  sql: Sql;
  exec: (text: string) => Promise<void>;
  close: () => Promise<void>;
  fork?: () => Promise<{ sql: Sql; close: () => Promise<void> }>;
};

type ArticleInput = {
  slug?: string;
  title?: string;
  theme?: string;
  slot?: string;
  date?: string;
  status?: string;
  publishedAt?: string | null;
  summary?: string[];
  bodyMd?: string;
  sources?: unknown;
  verification?: unknown;
  related?: string[];
  aiGenerated?: boolean | null;
  author?: string;
};

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
alter role anon nobypassrls;
alter role authenticated nobypassrls;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

function sqlState(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") {
      return code;
    }
  }
  return "";
}

function textArray(values: string[]): string {
  return `{${values
    .map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(",")}}`;
}

async function expectSqlState(run: () => Promise<unknown>, code: string) {
  try {
    await run();
  } catch (error) {
    expect(sqlState(error)).toBe(code);
    return;
  }
  throw new Error(`SQLSTATE ${code} を期待しましたが、文は成功しました`);
}

async function openPglite(): Promise<Db> {
  const db = new PGlite();
  const sql: Sql = async <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = [],
  ) => {
    const result = await db.query(text, [...params]);
    return {
      rows: result.rows as T[],
      rowCount: result.rows.length,
    };
  };

  return {
    sql,
    exec: async (text) => {
      await db.exec(text);
    },
    close: () => db.close(),
  };
}

function pgClient(database: string) {
  return new Client({
    host: "/var/run/postgresql",
    database,
  });
}

async function openPostgres(): Promise<Db> {
  const database = "kuro_jiho_schema_test";
  const admin = pgClient("postgres");
  await admin.connect();
  await admin.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1 and pid <> pg_backend_pid()`,
    [database],
  );
  await admin.query(`drop database if exists ${database}`);
  await admin.query(`create database ${database}`);
  await admin.end();

  const client = pgClient(database);
  await client.connect();

  const sql: Sql = async <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = [],
  ) => {
    const result = await client.query(text, [...params]);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? result.rows.length,
    };
  };

  return {
    sql,
    exec: async (text) => {
      await client.query(text);
    },
    fork: async () => {
      const extra = pgClient(database);
      await extra.connect();
      return {
        sql: async <T extends Record<string, unknown> = Record<string, unknown>>(
          text: string,
          params: readonly unknown[] = [],
        ) => {
          const result = await extra.query(text, [...params]);
          return {
            rows: result.rows as T[],
            rowCount: result.rowCount ?? result.rows.length,
          };
        },
        close: () => extra.end(),
      };
    },
    close: async () => {
      await client.end();
      const cleanup = pgClient("postgres");
      await cleanup.connect();
      await cleanup.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [database],
      );
      await cleanup.query(`drop database if exists ${database}`);
      await cleanup.end();
    },
  };
}

function registerSchemaTests(name: string, open: () => Promise<Db>) {
  describe(name, () => {
    let db: Db;

    beforeAll(async () => {
      db = await open();
      await db.exec(preludeSql);
      await db.exec(migrationSql);
    }, 60_000);

    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      await db.exec("rollback").catch(() => undefined);
      await db.exec("reset role");
      await db.sql(`select set_config('request.jwt.claims', '', false)`);
      await db.sql(`select set_config('request.headers', '', false)`);
      await db.sql(`select set_config('kuro.change_type', '', false)`);
      await db.sql(`select set_config('kuro.change_note', '', false)`);
      await db.sql(`select set_config('kuro.actor', '', false)`);
      await db.exec(`
        truncate table
          public.article_revisions,
          public.articles,
          public.slot_logs,
          public.api_rate_limits,
          public.admin_allowlist
      `);
    });

    async function withRole<T>(
      options: {
        role: RoleName;
        claims?: Record<string, unknown> | null;
        changeType?: string;
        changeNote?: string;
        actor?: string;
        headers?: Record<string, string>;
      },
      run: () => Promise<T>,
    ): Promise<T> {
      await db.exec("begin");
      try {
        await db.sql(`select set_config('request.jwt.claims', $1, true)`, [
          options.claims ? JSON.stringify(options.claims) : "",
        ]);
        if (options.changeType !== undefined) {
          await db.sql(`select set_config('kuro.change_type', $1, true)`, [
            options.changeType,
          ]);
        }
        if (options.changeNote !== undefined) {
          await db.sql(`select set_config('kuro.change_note', $1, true)`, [
            options.changeNote,
          ]);
        }
        if (options.actor !== undefined) {
          await db.sql(`select set_config('kuro.actor', $1, true)`, [options.actor]);
        }
        if (options.headers) {
          await db.sql(`select set_config('request.headers', $1, true)`, [
            JSON.stringify(options.headers),
          ]);
        }
        await db.sql(`set local role ${options.role}`);
        const value = await run();
        await db.exec("commit");
        return value;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }

    async function insertArticle(input: ArticleInput = {}) {
      const summary = input.summary ?? ["一点目", "二点目", "三点目"];
      const related = input.related ?? [];
      const result = await db.sql<{ id: string; version: number; title: string }>(
        `insert into public.articles (
           slug, title, theme, slot, date, status, published_at, summary, body_md,
           sources, verification, related, ai_generated, author
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8::text[], $9,
           $10::jsonb, $11::jsonb, $12::text[], $13, $14
         )
         returning id, version, title`,
        [
          input.slug ?? "2026-12-01-07-sample",
          input.title ?? "見出し",
          input.theme ?? "fukuoka",
          input.slot ?? "07",
          input.date ?? "2026-12-01",
          input.status ?? "draft",
          input.publishedAt === undefined ? null : input.publishedAt,
          textArray(summary),
          input.bodyMd ?? "本文",
          JSON.stringify(input.sources ?? [{ id: "1" }]),
          JSON.stringify(input.verification ?? { checked: [], removed: [] }),
          textArray(related),
          input.aiGenerated === undefined ? true : input.aiGenerated,
          input.author ?? "kuro",
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("記事を挿入できませんでした");
      }
      return row;
    }

    async function revisionCount(articleId: string) {
      const result = await db.sql<{ count: number }>(
        `select count(*)::int as count
         from public.article_revisions
         where article_id = $1`,
        [articleId],
      );
      return Number(result.rows[0]?.count ?? 0);
    }

    it("enables RLS on every table and grants no DELETE", async () => {
      const flags = await db.sql<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
         order by c.relname`,
      );
      expect(flags.rows.map((row) => row.relname)).toEqual([...tables]);
      expect(flags.rows.every((row) => row.relrowsecurity)).toBe(true);

      const deletePolicies = await db.sql<{ count: number }>(
        `select count(*)::int as count from pg_policy where polcmd = 'd'`,
      );
      expect(Number(deletePolicies.rows[0]?.count)).toBe(0);

      const deleteGrants = await db.sql<{ count: number }>(
        `select count(*)::int as count
         from information_schema.role_table_grants
         where table_schema = 'public'
           and privilege_type = 'DELETE'
           and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')`,
      );
      expect(Number(deleteGrants.rows[0]?.count)).toBe(0);

      const rateLimitExecute = await db.sql<{ grantee: string }>(
        `select grantee
         from information_schema.routine_privileges
         where routine_schema = 'public'
           and routine_name = 'consume_rate_limit'
           and privilege_type = 'EXECUTE'
         order by grantee`,
      );
      const rateLimitGrantees = rateLimitExecute.rows.map((row) => row.grantee);
      expect(rateLimitGrantees).toContain("service_role");
      expect(rateLimitGrantees).not.toContain("anon");
      expect(rateLimitGrantees).not.toContain("authenticated");
      expect(rateLimitGrantees).not.toContain("PUBLIC");

      const views = await db.sql<{ relname: string; reloptions: string[] | null }>(
        `select c.relname, c.reloptions
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'v'
         order by c.relname`,
      );
      expect(views.rows).toEqual([
        {
          relname: "article_corrections",
          reloptions: ["security_invoker=true", "security_barrier=true"],
        },
        {
          relname: "slot_logs_public",
          reloptions: ["security_invoker=true", "security_barrier=true"],
        },
      ]);
    });

    it("matches the TypeScript column lists", async () => {
      const columns = await db.sql<{ table_name: string; column_name: string }>(
        `select table_name, column_name
         from information_schema.columns
         where table_schema = 'public'
           and table_name = any($1::text[])
         order by table_name, ordinal_position`,
        [[...tables, "article_corrections", "slot_logs_public"]],
      );
      const grouped = new Map<string, string[]>();
      for (const row of columns.rows) {
        const list = grouped.get(row.table_name) ?? [];
        list.push(row.column_name);
        grouped.set(row.table_name, list);
      }

      expect(grouped.get("articles")).toEqual(articleColumns);
      expect(grouped.get("article_revisions")).toEqual(revisionColumns);
      expect(grouped.get("slot_logs")).toEqual(slotLogColumns);
      expect(grouped.get("api_rate_limits")).toEqual(["key", "window_start", "count"]);
      expect(grouped.get("admin_allowlist")).toEqual(["email"]);
      expect(grouped.get("article_corrections")).toEqual(correctionColumns);
      expect(grouped.get("slot_logs_public")).toEqual(["date", "slot", "status"]);
      expect(correctionColumns).not.toContain("snapshot");
      expect(grouped.get("slot_logs_public")).not.toContain("reason");
    });

    it("rejects ai_generated false and an empty source list", async () => {
      await expectSqlState(
        () => insertArticle({ slug: "2026-12-01-12-false", aiGenerated: false }),
        "23514",
      );
      await expectSqlState(
        () => insertArticle({ slug: "2026-12-01-12-null", aiGenerated: null }),
        "23502",
      );
      await expectSqlState(
        () => insertArticle({ slug: "2026-12-01-12-empty", sources: [] }),
        "23514",
      );
      await expectSqlState(
        () => insertArticle({ slug: "2026-12-01-12-object", sources: { id: "1" } }),
        "23514",
      );
      await expectSqlState(
        () =>
          insertArticle({
            slug: "2026-12-01-17-summary",
            summary: ["一つだけ"],
          }),
        "23514",
      );
    });

    it("stores one previous row on update and blocks a second published slot", async () => {
      const created = await insertArticle();
      expect(await revisionCount(created.id)).toBe(0);

      await db.sql(`update public.articles set title = $1 where id = $2`, [
        "更新後",
        created.id,
      ]);

      expect(await revisionCount(created.id)).toBe(1);
      const revision = await db.sql<{
        version: number;
        change_type: string;
        actor: string;
        old_title: string;
      }>(
        `select version, change_type, actor, snapshot->>'title' as old_title
         from public.article_revisions
         where article_id = $1`,
        [created.id],
      );
      expect(revision.rows).toEqual([
        {
          version: 1,
          change_type: "update",
          actor: "kuro",
          old_title: "見出し",
        },
      ]);
      const current = await db.sql<{ version: number; title: string }>(
        `select version, title from public.articles where id = $1`,
        [created.id],
      );
      expect(current.rows[0]).toMatchObject({ version: 2, title: "更新後" });

      await expectSqlState(
        () =>
          insertArticle({
            slug: "2026-12-01-17-missing-time",
            slot: "17",
            status: "published",
          }),
        "23514",
      );
      await insertArticle({
        slug: "2026-12-01-12-published",
        slot: "12",
        theme: "sports",
        status: "published",
        publishedAt: "2026-12-01T03:00:00Z",
      });
      await expectSqlState(
        () =>
          insertArticle({
            slug: "2026-12-01-12-again",
            slot: "12",
            theme: "f1",
            status: "published",
            publishedAt: "2026-12-01T03:00:00Z",
          }),
        "23505",
      );
      const draft = await insertArticle({
        slug: "2026-12-01-12-draft",
        slot: "12",
        theme: "it",
        status: "draft",
      });
      expect(draft.id).toBeTruthy();
    });

    it("requires a note for correction and keeps the article when it is missing", async () => {
      const created = await insertArticle();

      await expectSqlState(
        () =>
          withRole({ role: "service_role", changeType: "correction", changeNote: "  " }, () =>
            db.sql(`update public.articles set title = '失敗' where id = $1`, [created.id]),
          ),
        "23514",
      );
      const unchanged = await db.sql<{ title: string }>(
        `select title from public.articles where id = $1`,
        [created.id],
      );
      expect(unchanged.rows[0]?.title).toBe("見出し");
      expect(await revisionCount(created.id)).toBe(0);

      await withRole(
        { role: "service_role", changeType: "correction", changeNote: "日付を直した" },
        () => db.sql(`update public.articles set title = '訂正後' where id = $1`, [created.id]),
      );
      const stored = await db.sql<{ change_type: string; note: string; actor: string }>(
        `select change_type, note, actor
         from public.article_revisions
         where article_id = $1`,
        [created.id],
      );
      expect(stored.rows).toEqual([
        { change_type: "correction", note: "日付を直した", actor: "kuro" },
      ]);
    });

    it("reads correction context from request headers", async () => {
      const created = await insertArticle();
      await withRole(
        {
          role: "service_role",
          headers: {
            "x-kuro-change-type": "publish",
            "x-kuro-change-note": "公開した",
            "x-kuro-actor": "kuro",
          },
        },
        () =>
          db.sql(
            `update public.articles
             set status = 'published', published_at = '2026-12-01T03:00:00Z'
             where id = $1`,
            [created.id],
          ),
      );
      const stored = await db.sql<{ change_type: string; note: string; actor: string }>(
        `select change_type, note, actor from public.article_revisions where article_id = $1`,
        [created.id],
      );
      expect(stored.rows).toEqual([
        { change_type: "publish", note: "公開した", actor: "kuro" },
      ]);
    });

    it("hides drafts, writes, deletes, snapshots, and skip reasons from anon", async () => {
      const draft = await insertArticle();
      const published = await insertArticle({
        slug: "2026-12-01-12-published",
        slot: "12",
        status: "published",
        publishedAt: "2026-12-01T03:00:00Z",
      });
      await withRole(
        { role: "service_role", changeType: "correction", changeNote: "数字を直した" },
        () => db.sql(`update public.articles set title = '公開訂正' where id = $1`, [published.id]),
      );
      await withRole(
        { role: "service_role", changeType: "correction", changeNote: "下書きの訂正" },
        () => db.sql(`update public.articles set title = '下書き訂正' where id = $1`, [draft.id]),
      );
      await db.sql(
        `insert into public.slot_logs (date, slot, status, reason)
         values ('2026-12-01', '20', 'skipped', '一次情報がない')`,
      );

      const visible = await withRole({ role: "anon" }, () =>
        db.sql<{ slug: string }>(`select slug from public.articles order by slug`),
      );
      expect(visible.rows.map((row) => row.slug)).toEqual(["2026-12-01-12-published"]);

      const corrections = await withRole({ role: "anon" }, () =>
        db.sql<{ note: string }>(
          `select note from public.article_corrections order by note`,
        ),
      );
      expect(corrections.rows).toEqual([{ note: "数字を直した" }]);

      const publicSlots = await withRole({ role: "anon" }, () =>
        db.sql(`select date::text, slot, status from public.slot_logs_public`),
      );
      expect(publicSlots.rows).toEqual([
        { date: "2026-12-01", slot: "20", status: "skipped" },
      ]);

      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () =>
            insertArticle({ slug: "2026-12-02-07-anon" }),
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () =>
            db.sql(`update public.articles set title = '改ざん' where id = $1`, [published.id]),
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () =>
            db.sql(`delete from public.articles where id = $1`, [published.id]),
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () =>
            db.sql(`select snapshot from public.article_revisions`),
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () => db.sql(`select reason from public.slot_logs`)),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "anon" }, () =>
            db.sql(`select public.consume_rate_limit('anon', 1, 60)`),
          ),
        "42501",
      );
      await expectSqlState(
        () => withRole({ role: "anon" }, () => db.sql(`select email from public.admin_allowlist`)),
        "42501",
      );

      expect(await revisionCount(published.id)).toBe(1);
      const title = await db.sql<{ title: string }>(
        `select title from public.articles where id = $1`,
        [published.id],
      );
      expect(title.rows[0]?.title).toBe("公開訂正");
    });

    it("lets only allowlisted users write, and nobody delete", async () => {
      const draft = await insertArticle();
      await db.sql(`insert into public.admin_allowlist (email) values ('editor@example.com')`);
      await expectSqlState(
        () => db.sql(`insert into public.admin_allowlist (email) values ('Editor@example.com')`),
        "23514",
      );

      const outsider = {
        role: "authenticated" as const,
        claims: { email: "other@example.com", sub: outsiderId },
      };
      const hidden = await withRole(outsider, () =>
        db.sql(`select id from public.articles`),
      );
      expect(hidden.rows).toEqual([]);
      await expectSqlState(
        () =>
          withRole(outsider, () => insertArticle({ slug: "2026-12-02-17-outsider" })),
        "42501",
      );
      await withRole(outsider, () =>
        db.sql(`update public.articles set title = '侵入' where id = $1`, [draft.id]),
      );
      const still = await db.sql<{ title: string }>(
        `select title from public.articles where id = $1`,
        [draft.id],
      );
      expect(still.rows[0]?.title).toBe("見出し");
      expect(await revisionCount(draft.id)).toBe(0);
      await expectSqlState(
        () =>
          withRole(outsider, () =>
            db.sql(`delete from public.articles where id = $1`, [draft.id]),
          ),
        "42501",
      );

      await withRole(
        {
          role: "authenticated",
          claims: { email: "Editor@example.com", sub: adminId },
          actor: "kuro",
          changeType: "update",
        },
        () => db.sql(`update public.articles set title = '管理者' where id = $1`, [draft.id]),
      );
      const revision = await db.sql<{ actor: string; change_type: string }>(
        `select actor, change_type from public.article_revisions where article_id = $1`,
        [draft.id],
      );
      expect(revision.rows).toEqual([
        { actor: `admin:${adminId}`, change_type: "update" },
      ]);
      await expectSqlState(
        () =>
          withRole(
            {
              role: "authenticated",
              claims: { email: "editor@example.com", sub: adminId },
            },
            () => db.sql(`delete from public.articles where id = $1`, [draft.id]),
          ),
        "42501",
      );

      const seenByService = await withRole({ role: "service_role" }, () =>
        db.sql<{ title: string }>(`select title from public.articles where id = $1`, [draft.id]),
      );
      expect(seenByService.rows[0]?.title).toBe("管理者");
      await expectSqlState(
        () =>
          withRole({ role: "service_role" }, () =>
            db.sql(`delete from public.articles where id = $1`, [draft.id]),
          ),
        "42501",
      );
      await expectSqlState(
        () =>
          withRole({ role: "service_role" }, () =>
            db.sql(`delete from public.article_revisions where article_id = $1`, [draft.id]),
          ),
        "42501",
      );
    });

    it("stops consume_rate_limit at the limit without incrementing further", async () => {
      const calls = await withRole({ role: "service_role" }, async () => {
        const first = await db.sql<{ ok: boolean }>(
          `select public.consume_rate_limit('write', 2, 86400) as ok`,
        );
        const second = await db.sql<{ ok: boolean }>(
          `select public.consume_rate_limit('write', 2, 86400) as ok`,
        );
        const third = await db.sql<{ ok: boolean }>(
          `select public.consume_rate_limit('write', 2, 86400) as ok`,
        );
        const other = await db.sql<{ ok: boolean }>(
          `select public.consume_rate_limit('other', 2, 86400) as ok`,
        );
        return [first.rows[0]?.ok, second.rows[0]?.ok, third.rows[0]?.ok, other.rows[0]?.ok];
      });
      expect(calls).toEqual([true, true, false, true]);

      const counts = await db.sql<{ key: string; count: number }>(
        `select key, count from public.api_rate_limits order by key`,
      );
      expect(counts.rows).toEqual([
        { key: "other", count: 1 },
        { key: "write", count: 2 },
      ]);
    });

    if (name === "postgres") {
      it("does not pass the limit when calls race", async () => {
        if (!db.fork) {
          throw new Error("postgres suite should fork connections");
        }
        const workers = await Promise.all(Array.from({ length: 8 }, () => db.fork!()));
        try {
          const results = await Promise.all(
            workers.map(async (worker) => {
              await worker.sql(`set role service_role`);
              const result = await worker.sql<{ ok: boolean }>(
                `select public.consume_rate_limit('race', 5, 86400) as ok`,
              );
              return result.rows[0]?.ok;
            }),
          );
          expect(results.filter(Boolean)).toHaveLength(5);
          const count = await db.sql<{ count: number }>(
            `select count from public.api_rate_limits where key = 'race'`,
          );
          expect(Number(count.rows[0]?.count)).toBe(5);
        } finally {
          await Promise.all(workers.map((worker) => worker.close()));
        }
      });
    }
  });
}

const articleColumns = [
  "id",
  "slug",
  "title",
  "theme",
  "slot",
  "date",
  "status",
  "published_at",
  "updated_at",
  "summary",
  "body_md",
  "sources",
  "verification",
  "related",
  "ai_generated",
  "author",
  "version",
] as const;

const revisionColumns = [
  "id",
  "article_id",
  "version",
  "snapshot",
  "change_type",
  "note",
  "actor",
  "created_at",
] as const;

const slotLogColumns = ["id", "date", "slot", "status", "reason", "created_at"] as const;

const correctionColumns = [
  "id",
  "article_id",
  "version",
  "change_type",
  "note",
  "actor",
  "created_at",
] as const;

type Assert<T extends true> = T;
type RowKeys<T> = keyof T;
type SameKeys<T, Keys extends readonly string[]> =
  RowKeys<T> extends Keys[number] ? (Keys[number] extends RowKeys<T> ? true : false) : false;

type _schemaTypes = [
  Assert<SameKeys<Database["public"]["Tables"]["articles"]["Row"], typeof articleColumns>>,
  Assert<
    SameKeys<Database["public"]["Tables"]["article_revisions"]["Row"], typeof revisionColumns>
  >,
  Assert<SameKeys<Database["public"]["Tables"]["slot_logs"]["Row"], typeof slotLogColumns>>,
  Assert<
    SameKeys<Database["public"]["Views"]["article_corrections"]["Row"], typeof correctionColumns>
  >,
  Assert<
    SameKeys<
      Database["public"]["Views"]["slot_logs_public"]["Row"],
      readonly ["date", "slot", "status"]
    >
  >,
  Assert<
    Database["public"]["Functions"]["consume_rate_limit"]["Returns"] extends boolean
      ? true
      : false
  >,
  Assert<"snapshot" extends keyof Database["public"]["Views"]["article_corrections"]["Row"] ? false : true>,
];

void 0 as unknown as _schemaTypes;

registerSchemaTests("pglite", openPglite);

const postgresReady = await (async () => {
  if (!existsSync("/var/run/postgresql")) {
    return false;
  }
  const client = pgClient("postgres");
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
})();

describe.skipIf(!postgresReady)("postgres availability", () => {
  it("runs the same schema checks on local Postgres", () => {
    expect(postgresReady).toBe(true);
  });
});

if (postgresReady) {
  registerSchemaTests("postgres", openPostgres);
}
