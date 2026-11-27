-- 管理画面のセッション確認。引数にメールアドレスを取らない。
-- 中身は private.is_allowlisted_admin()（JWT の email だけ）。
-- 記事の更新は既存の kuro_apply_article_update を authenticated からも
-- 実行できるようにする。行の可否は articles の RLS（許可リスト）が決める。
-- ログイン中は改訂トリガーが actor を admin:<uuid> にする。
-- DELETE は付けない。anon には実行させない。

create or replace function public.admin_session_allowed()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select private.is_allowlisted_admin() is true;
$fn$;

comment on function public.admin_session_allowed() is
  '現在の JWT の email が admin_allowlist にあるとき true。';

revoke all on function public.admin_session_allowed()
  from public, anon, authenticated, service_role;

grant execute on function public.admin_session_allowed() to authenticated;

grant execute on function public.kuro_apply_article_update(uuid, jsonb, text, text, integer)
  to authenticated;
