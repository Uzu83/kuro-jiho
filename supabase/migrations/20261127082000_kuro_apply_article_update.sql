-- 投稿 API の更新。change_note は日本語を含むため HTTP ヘッダーに載せず、
-- 同一トランザクションで set_config してから articles を UPDATE する。
-- 改訂行は private.record_article_revision が残す。
-- expected_version が現在の version と違うときは更新しない。
-- service_role だけが実行できる。DELETE は付けない。

create or replace function public.kuro_apply_article_update(
  target_id uuid,
  patch jsonb,
  change_type text,
  change_note text,
  expected_version integer
)
returns setof public.articles
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
declare
  v_row public.articles;
begin
  if target_id is null or patch is null or pg_catalog.jsonb_typeof(patch) <> 'object' then
    raise exception 'patch must be an object'
      using errcode = '23514';
  end if;

  if change_type is null
    or change_type not in ('update', 'correction', 'publish', 'unpublish') then
    raise exception 'change_type must be update, correction, publish, or unpublish'
      using errcode = '23514';
  end if;

  if expected_version is null or expected_version < 1 then
    raise exception 'expected_version must be positive'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('kuro.change_type', change_type, true);
  perform pg_catalog.set_config('kuro.change_note', coalesce(change_note, ''), true);
  perform pg_catalog.set_config('kuro.actor', 'kuro', true);

  update public.articles as article
  set
    slug = case
      when pg_catalog.jsonb_exists(patch, 'slug') then patch ->> 'slug'
      else article.slug
    end,
    title = case
      when pg_catalog.jsonb_exists(patch, 'title') then patch ->> 'title'
      else article.title
    end,
    theme = case
      when pg_catalog.jsonb_exists(patch, 'theme') then patch ->> 'theme'
      else article.theme
    end,
    slot = case
      when pg_catalog.jsonb_exists(patch, 'slot') then patch ->> 'slot'
      else article.slot
    end,
    date = case
      when pg_catalog.jsonb_exists(patch, 'date') then (patch ->> 'date')::date
      else article.date
    end,
    status = case
      when pg_catalog.jsonb_exists(patch, 'status') then patch ->> 'status'
      else article.status
    end,
    published_at = case
      when pg_catalog.jsonb_exists(patch, 'published_at') then (patch ->> 'published_at')::timestamptz
      else article.published_at
    end,
    summary = case
      when pg_catalog.jsonb_exists(patch, 'summary') then
        array(select pg_catalog.jsonb_array_elements_text(patch -> 'summary'))
      else article.summary
    end,
    body_md = case
      when pg_catalog.jsonb_exists(patch, 'body_md') then patch ->> 'body_md'
      else article.body_md
    end,
    sources = case
      when pg_catalog.jsonb_exists(patch, 'sources') then patch -> 'sources'
      else article.sources
    end,
    verification = case
      when pg_catalog.jsonb_exists(patch, 'verification') then patch -> 'verification'
      else article.verification
    end,
    related = case
      when pg_catalog.jsonb_exists(patch, 'related') then
        array(select pg_catalog.jsonb_array_elements_text(patch -> 'related'))
      else article.related
    end,
    author = 'kuro'
  where article.id = target_id
    and article.version = expected_version
  returning * into v_row;

  if found then
    return next v_row;
    return;
  end if;

  if exists (select 1 from public.articles where id = target_id) then
    raise exception 'stale article version'
      using errcode = '40001';
  end if;

  return;
end;
$fn$;

comment on function public.kuro_apply_article_update(uuid, jsonb, text, text, integer) is
  '記事を更新し、トリガーへ change_type と change_note を渡す。version が一致しないときは更新しない。service_role 専用。';

revoke all on function public.kuro_apply_article_update(uuid, jsonb, text, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.kuro_apply_article_update(uuid, jsonb, text, text, integer)
  to service_role;

-- consume_rate_limit は窓が終わった行を、呼び出しのたびに最大200件消す。
-- service_role には DELETE がないため、テーブル所有者として実行する。
-- 認証失敗の新しい IP キーは、同じ窓に 60 件あるともう増やさない。

create or replace function public.consume_rate_limit(
  key text,
  "limit" integer,
  window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_now timestamptz;
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

  v_now := pg_catalog.clock_timestamp();
  v_window_start := pg_catalog.to_timestamp(
    floor(extract(epoch from v_now) / window_seconds) * window_seconds
  );

  delete from public.api_rate_limits as limits
  where limits.ctid in (
    select expired.ctid
    from public.api_rate_limits as expired
    where (
        expired.key = consume_rate_limit.key
        and expired.window_start <= v_now - pg_catalog.make_interval(secs => window_seconds)
      )
      or (
        (expired.key = 'kuro:auth-fail' or expired.key like 'kuro:auth-fail:%')
        and expired.window_start <= v_now - interval '60 seconds'
      )
      or (
        expired.key = 'kuro:write:hour'
        and expired.window_start <= v_now - interval '3600 seconds'
      )
      or (
        expired.key = 'kuro:write:day'
        and expired.window_start <= v_now - interval '86400 seconds'
      )
    limit 200
  );

  if key like 'kuro:auth-fail:%'
    and not exists (
      select 1
      from public.api_rate_limits as limits
      where limits.key = consume_rate_limit.key
        and limits.window_start = v_window_start
    )
    and (
      select count(*)
      from public.api_rate_limits as limits
      where limits.key like 'kuro:auth-fail:%'
        and limits.window_start = v_window_start
    ) >= 60
  then
    return false;
  end if;

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
  'key の窓を原子的に加算する。上限を超える呼び出しは false。期限の切れたクロの行は最大200件消す。service_role 専用。';

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
