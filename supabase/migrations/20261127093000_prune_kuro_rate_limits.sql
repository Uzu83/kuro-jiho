-- 投稿 API のレート制限行は、窓が終わったら消す。
-- service_role には DELETE がないため、テーブル所有者として実行する。
-- 対象はクロのキーだけ。他のキーは残す。

create or replace function public.prune_kuro_rate_limits()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  delete from public.api_rate_limits
  where (
      (key = 'kuro:auth-fail' or key like 'kuro:auth-fail:%')
      and window_start <= v_now - interval '60 seconds'
    )
    or (
      key = 'kuro:write:hour'
      and window_start <= v_now - interval '3600 seconds'
    )
    or (
      key = 'kuro:write:day'
      and window_start <= v_now - interval '86400 seconds'
    );
end;
$fn$;

comment on function public.prune_kuro_rate_limits() is
  'クロのレート制限のうち、窓が終わった行を消す。service_role 専用。';

revoke all on function public.prune_kuro_rate_limits()
  from public, anon, authenticated, service_role;

grant execute on function public.prune_kuro_rate_limits() to service_role;
