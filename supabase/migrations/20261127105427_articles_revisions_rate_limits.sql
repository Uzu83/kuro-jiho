-- 記事、改訂履歴、見送り、レート制限、管理者の許可リスト。
-- 前提は Supabase のロール（anon / authenticated / service_role）と
-- auth.jwt() / auth.uid()。
--
-- 記事の UPDATE と同じトランザクションで、改訂の種別を渡せる。
--   select set_config('kuro.change_type', 'correction', true);
--   select set_config('kuro.change_note', '訂正内容', true);
--   select set_config('kuro.actor', 'kuro', true);
-- PostgREST の同一リクエストでは、次のヘッダーも読む。
--   x-kuro-change-type / x-kuro-change-note / x-kuro-actor
-- 未指定の change_type は update。ログイン中（auth.uid() あり）の actor は
-- admin:<uuid> に固定する。それ以外の未指定 actor は kuro。

create schema if not exists private;

revoke all on schema private from public;

grant usage on schema public to anon, authenticated, service_role;

grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  theme text not null,
  slot text not null,
  date date not null,
  status text not null,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  summary text[] not null,
  body_md text not null,
  sources jsonb not null,
  verification jsonb not null,
  related text[] not null default '{}',
  ai_generated boolean not null default true,
  author text not null,
  version integer not null default 1,
  constraint articles_slug_key unique (slug),
  constraint articles_slug_not_blank check (length(btrim(slug)) > 0),
  constraint articles_theme_check check (theme in ('fukuoka', 'it', 'gadget', 'sports', 'f1')),
  constraint articles_slot_check check (slot in ('07', '12', '17', '20')),
  constraint articles_status_check check (status in ('draft', 'published', 'unpublished')),
  constraint articles_summary_three_items check (
    cardinality(summary) = 3
    and array_position(summary, null) is null
  ),
  constraint articles_sources_not_empty check (
    case
      when jsonb_typeof(sources) = 'array' then jsonb_array_length(sources) >= 1
      else false
    end
  ),
  constraint articles_verification_object check (jsonb_typeof(verification) = 'object'),
  constraint articles_ai_generated_true check (ai_generated = true),
  constraint articles_author_check check (author in ('kuro', 'admin')),
  constraint articles_version_positive check (version >= 1),
  constraint articles_published_at_required check (
    status <> 'published' or published_at is not null
  )
);

comment on table public.articles is '記事。date は日本時間の暦日。';

comment on column public.articles.date is '公開日（日本時間の暦日）。時刻は持たない。';

comment on column public.articles.ai_generated is '常に true。AI 以外の記事は保存できない。';

create index articles_date_slot_idx on public.articles (date, slot);

create unique index articles_one_published_per_slot
  on public.articles (date, slot)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- article_revisions
-- ---------------------------------------------------------------------------

create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  change_type text not null,
  note text,
  actor text not null,
  created_at timestamptz not null default now(),
  constraint article_revisions_article_id_fkey
    foreign key (article_id) references public.articles (id) on delete restrict,
  constraint article_revisions_article_version_key unique (article_id, version),
  constraint article_revisions_version_positive check (version >= 1),
  constraint article_revisions_change_type_check check (
    change_type in ('create', 'update', 'correction', 'publish', 'unpublish')
  ),
  constraint article_revisions_correction_note_required check (
    change_type <> 'correction'
    or (note is not null and length(btrim(note)) > 0)
  ),
  constraint article_revisions_actor_check check (
    actor = 'kuro'
    or actor ~ '^admin:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

comment on table public.article_revisions is '記事の更新前スナップショット。correction は note 必須。';

comment on column public.article_revisions.snapshot is '更新前の articles 行。公開 API には出さない。';

create index article_revisions_article_id_idx
  on public.article_revisions (article_id);

create index article_revisions_correction_idx
  on public.article_revisions (article_id)
  where change_type = 'correction';

-- ---------------------------------------------------------------------------
-- slot_logs / api_rate_limits / admin_allowlist
-- ---------------------------------------------------------------------------

create table public.slot_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint slot_logs_slot_check check (slot in ('07', '12', '17', '20')),
  constraint slot_logs_status_check check (status = 'skipped')
);

comment on table public.slot_logs is '枠の見送り。reason は公開しない。';

create index slot_logs_date_slot_idx on public.slot_logs (date, slot);

create table public.api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null,
  constraint api_rate_limits_pkey primary key (key, window_start),
  constraint api_rate_limits_key_not_blank check (length(btrim(key)) > 0),
  constraint api_rate_limits_count_nonnegative check (count >= 0)
);

comment on table public.api_rate_limits is 'consume_rate_limit が原子的に更新するカウンタ。';

create table public.admin_allowlist (
  email text primary key,
  constraint admin_allowlist_email_lowercase check (
    email = lower(email)
    and email = btrim(email)
    and length(email) between 3 and 320
    and position('@' in email) > 1
  )
);

comment on table public.admin_allowlist is '管理画面に入れるメールアドレス。小文字のみ。';

-- ---------------------------------------------------------------------------
-- 改訂トリガー
-- ---------------------------------------------------------------------------

create or replace function private.record_article_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_headers jsonb;
  v_change_type text;
  v_note text;
  v_actor text;
begin
  if new.id is distinct from old.id then
    raise exception 'articles.id cannot be changed'
      using errcode = '23514';
  end if;

  v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;

  v_change_type := coalesce(
    nullif(pg_catalog.current_setting('kuro.change_type', true), ''),
    nullif(v_headers ->> 'x-kuro-change-type', ''),
    'update'
  );

  v_note := coalesce(
    nullif(pg_catalog.btrim(pg_catalog.current_setting('kuro.change_note', true)), ''),
    nullif(pg_catalog.btrim(v_headers ->> 'x-kuro-change-note'), '')
  );

  if (select auth.uid()) is not null then
    v_actor := 'admin:' || (select auth.uid())::text;
  else
    v_actor := coalesce(
      nullif(pg_catalog.current_setting('kuro.actor', true), ''),
      nullif(v_headers ->> 'x-kuro-actor', ''),
      'kuro'
    );
  end if;

  if v_change_type not in ('create', 'update', 'correction', 'publish', 'unpublish') then
    raise exception 'change_type must be create, update, correction, publish, or unpublish'
      using errcode = '23514';
  end if;

  if v_change_type = 'correction' and v_note is null then
    raise exception 'correction requires a note'
      using errcode = '23514';
  end if;

  if v_actor is distinct from 'kuro'
    and v_actor !~ '^admin:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'actor must be kuro or admin:<uuid>'
      using errcode = '23514';
  end if;

  insert into public.article_revisions (
    article_id,
    version,
    snapshot,
    change_type,
    note,
    actor
  ) values (
    old.id,
    old.version,
    pg_catalog.to_jsonb(old),
    v_change_type,
    v_note,
    v_actor
  );

  if new.version is null or new.version <= old.version then
    new.version := old.version + 1;
  end if;

  new.updated_at := pg_catalog.now();

  return new;
end;
$fn$;

comment on function private.record_article_revision() is
  'articles の UPDATE で更新前の行を article_revisions に残す。';

revoke all on function private.record_article_revision() from public, anon, authenticated, service_role;

create trigger articles_record_revision
  before update on public.articles
  for each row
  execute function private.record_article_revision();

-- ---------------------------------------------------------------------------
-- 許可リスト判定。RLS からだけ呼ぶ。中身は現在の JWT の email だけを見る。
-- ---------------------------------------------------------------------------

create or replace function private.is_allowlisted_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.admin_allowlist as allowlist
    where allowlist.email = lower((select auth.jwt() ->> 'email'))
  );
$fn$;

comment on function private.is_allowlisted_admin() is
  'auth.jwt() の email が admin_allowlist にあるとき true。';

revoke all on function private.is_allowlisted_admin() from public, anon, authenticated, service_role;

grant execute on function private.is_allowlisted_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- レート制限。超過したら false で、count は limit を超えない。
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  key text,
  "limit" integer,
  window_seconds integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if key is null or pg_catalog.length(pg_catalog.btrim(key)) = 0 then
    raise exception 'key is required'
      using errcode = '23514';
  end if;

  if "limit" is null or "limit" < 1 then
    raise exception 'limit must be positive'
      using errcode = '23514';
  end if;

  if window_seconds is null or window_seconds < 1 then
    raise exception 'window_seconds must be positive'
      using errcode = '23514';
  end if;

  v_window_start := pg_catalog.to_timestamp(
    floor(extract(epoch from pg_catalog.clock_timestamp()) / window_seconds)
    * window_seconds
  );

  -- 引数名 key / limit が列名と衝突するため、SQL 本文では $1 を使う。
  -- 行が返らない（上限）ときは v_count を NULL のままにする。
  v_count := null;

  execute
    $sql$
      insert into public.api_rate_limits as limits (key, window_start, count)
      values ($1, $2, 1)
      on conflict (key, window_start)
      do update
        set count = limits.count + 1
        where limits.count < $3
      returning count
    $sql$
    into v_count
    using key, v_window_start, "limit";

  return v_count is not null;
end;
$fn$;

comment on function public.consume_rate_limit(text, integer, integer) is
  'key の窓を原子的に加算する。上限を超える呼び出しは false。';

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.articles enable row level security;

alter table public.article_revisions enable row level security;

alter table public.slot_logs enable row level security;

alter table public.api_rate_limits enable row level security;

alter table public.admin_allowlist enable row level security;

create policy articles_anon_select_published
  on public.articles
  for select
  to anon
  using (status = 'published');

create policy articles_admin_select
  on public.articles
  for select
  to authenticated
  using ((select private.is_allowlisted_admin()));

create policy articles_admin_insert
  on public.articles
  for insert
  to authenticated
  with check ((select private.is_allowlisted_admin()));

create policy articles_admin_update
  on public.articles
  for update
  to authenticated
  using ((select private.is_allowlisted_admin()))
  with check ((select private.is_allowlisted_admin()));

create policy article_revisions_anon_select_published_corrections
  on public.article_revisions
  for select
  to anon
  using (
    change_type = 'correction'
    and exists (
      select 1
      from public.articles as article
      where article.id = article_id
        and article.status = 'published'
    )
  );

create policy article_revisions_admin_select
  on public.article_revisions
  for select
  to authenticated
  using ((select private.is_allowlisted_admin()));

create policy slot_logs_anon_select
  on public.slot_logs
  for select
  to anon
  using (true);

-- DELETE のポリシーは作らない。

-- ---------------------------------------------------------------------------
-- 公開用ビュー。security_invoker なので基表の RLS と列権限に従う。
-- snapshot と reason は列に含めない。
-- ---------------------------------------------------------------------------

create view public.article_corrections
with (security_invoker = true, security_barrier = true) as
select
  revision.id,
  revision.article_id,
  revision.version,
  revision.change_type,
  revision.note,
  revision.actor,
  revision.created_at
from public.article_revisions as revision
inner join public.articles as article on article.id = revision.article_id
where revision.change_type = 'correction'
  and article.status = 'published';

comment on view public.article_corrections is
  '公開済み記事の訂正。snapshot は含まない。';

create view public.slot_logs_public
with (security_invoker = true, security_barrier = true) as
select
  slot_log.date,
  slot_log.slot,
  slot_log.status
from public.slot_logs as slot_log;

comment on view public.slot_logs_public is
  '見送りの公開列。reason は含まない。';

-- ---------------------------------------------------------------------------
-- 権限。既定の GRANT があっても DELETE は残さない。
-- ---------------------------------------------------------------------------

revoke all on table public.articles from public, anon, authenticated, service_role;

revoke all on table public.article_revisions from public, anon, authenticated, service_role;

revoke all on table public.slot_logs from public, anon, authenticated, service_role;

revoke all on table public.api_rate_limits from public, anon, authenticated, service_role;

revoke all on table public.admin_allowlist from public, anon, authenticated, service_role;

revoke all on table public.article_corrections from public, anon, authenticated, service_role;

revoke all on table public.slot_logs_public from public, anon, authenticated, service_role;

grant select on table public.articles to anon;

grant select, insert, update on table public.articles to authenticated;

grant select, insert, update on table public.articles to service_role;

grant select (
  id,
  article_id,
  version,
  change_type,
  note,
  actor,
  created_at
) on table public.article_revisions to anon;

grant select on table public.article_revisions to authenticated;

grant select on table public.article_revisions to service_role;

grant select (date, slot, status) on table public.slot_logs to anon;

grant select, insert, update on table public.slot_logs to service_role;

grant select, insert, update on table public.api_rate_limits to service_role;

grant select, insert, update on table public.admin_allowlist to service_role;

grant select on table public.article_corrections to anon, authenticated, service_role;

grant select on table public.slot_logs_public to anon, service_role;

revoke delete on table public.articles from public, anon, authenticated, service_role;

revoke delete on table public.article_revisions from public, anon, authenticated, service_role;

revoke delete on table public.slot_logs from public, anon, authenticated, service_role;

revoke delete on table public.api_rate_limits from public, anon, authenticated, service_role;

revoke delete on table public.admin_allowlist from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate on table public.article_corrections
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate on table public.slot_logs_public
  from public, anon, authenticated, service_role;
