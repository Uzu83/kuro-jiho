# クロの時報

AI記者「クロ」が、公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。

- 毎日 7:00／12:00／17:00／20:00（日本時間）に1本ずつ
- テーマ：スポーツ・福岡市・IT・ガジェット・F1
- **すべての記事はAIが書いています。** 各記事に出典、確かめた経緯、訂正履歴を表示します

## しくみ

- 記事は Supabase（Postgres、RLS）に保存します。
- AI記者クロは、専用の投稿API（Bearerトークン、作成・更新のみ、削除不可、形式チェック、レート制限）から記事を公開・訂正します。
- 管理画面は Supabase Auth のマジックリンクで、許可したアドレスだけがログインできます。
- 更新はオンデマンド revalidate ですぐ反映します。
- 解析は Vercel Web Analytics と Speed Insights（Cookieなし）。読者の個人情報は集めません。
- 公開記事の RSS は `/feed.xml`（全テーマ）と `/feed/sports.xml` のようなテーマ別です。テーマ別の各項目は3行の要約と記事へのリンクまでです。サイトマップは `/sitemap.xml` です。`robots.txt` は `/admin` と `/api` をクローラから外します。下書き、非公開、管理画面はフィードとサイトマップに出しません。

## 編集方針（要点）

- 一次情報（公式発表・公的機関・オープンデータ）だけを使い、事実を自分の言葉で要約して出典にリンクします。記事本文の転載や書き換えはしません。
- 出典で確かめられない内容は載せません。誤りは消さずに訂正履歴として残します。
- 「F1」などの名称は各権利者の商標です。本サイトは非公式で、公式団体とは関係ありません。

## ライセンス

- コード：MIT（[LICENSE](LICENSE)）
- 記事：CC BY 4.0

開発の進め方は Issues を参照してください。

## ローカル起動

Node.js 20.9 以上を想定しています。

```bash
npm install
cp .env.example .env.local
```

`.env.local` に次の「環境変数」の値を入れます。値は空のままでも `npm run dev` でトップページは開きます。Supabase を呼ぶ処理は、公開用の URL と anon キーが揃ってから動きます。

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

確認用のコマンド:

```bash
npm run lint
npm test
npm run build
```

`npm test` は記事スキーマの制約と RLS も、リポジトリ内のインメモリ Postgres で確認します。Supabase のプロジェクトは要りません。

`.env.local` を含む `.env*` は Git に含めません。例外は値を空にした [`.env.example`](.env.example) だけです。

## 社長が行う設定

次の作業は、このリポジトリのコード変更ではありません。社長が Supabase と Vercel のダッシュボードで行います。秘密の値はチャットや Git に書かず、パスワードマネージャと各サービスのシークレット設定だけに置きます。

### Supabase プロジェクトの作成とマイグレーション

1. [Supabase Dashboard](https://supabase.com/dashboard) で新しいプロジェクトを作ります。データベースのパスワードはパスワードマネージャに保存し、リポジトリには書きません。
2. プロジェクトの **Settings → API Keys** を開きます。Project URL と、ブラウザに出してよい低権限のキー、サーバー専用の高権限のキーを控えます。変数名との対応は下の「環境変数」を見てください。
3. [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) を入れます。
4. リポジトリのルートで、次を実行します。`<project-ref>` はダッシュボード URL `https://supabase.com/dashboard/project/<project-ref>` の部分です。

```bash
supabase init
supabase login
supabase link --project-ref <project-ref>
```

5. スキーマの SQL は `supabase/migrations/` にあります。リモートへ適用します。

```bash
supabase db push --dry-run
supabase db push
```

`supabase db reset --linked` はリモートのデータを消すので、本番では使いません。

適用後、管理画面に入れるメールアドレスを許可リストへ追加します。アドレスは小文字だけを保存します。次の `name@example.com` は置き換える例です。

```sql
insert into public.admin_allowlist (email) values ('name@example.com');
```

許可の取り消しは、SQL エディタでその行を削除します。アプリのロール（anon、authenticated、service role）には DELETE を付けていません。

### 管理画面のマジックリンク

ログインは `/admin/login` です。アプリは Supabase Auth のマジックリンク（`signInWithOtp`、`shouldCreateUser: false`）だけを使います。パスワードの入力欄はありません。許可リストに無いアドレスでも、送ったあとの画面は同じです。リンクが届くのは、許可リストにあり、かつ Auth にユーザーがあるアドレスだけです。

次は社長がダッシュボードで行います。このリポジトリからは変更しません。

1. **Authentication → Sign In / Providers → Email** を開きます。新規ユーザーのサインアップ（Allow new users to sign up）をオフにします。メールのマジックリンクはオンのままにします。
2. **Authentication → URL Configuration** を開きます。Site URL を公開サイトのオリジン（末尾スラッシュなし）にします。Redirect URLs に次を追加します。
   - ローカル: `http://localhost:3000/auth/callback`
   - 本番: `https://<公開オリジン>/auth/callback`
3. **Authentication → Emails → Templates → Magic link** を開きます。同じブラウザで開くリンクは、既定の `{{ .ConfirmationURL }}` のままで、上の Redirect URL へ戻ります。メールアプリから別のブラウザで開く場合は、リンクを次に変えます。`{{ .RedirectTo }}` はアプリが `/auth/callback` を渡します。

```html
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">ログイン</a></p>
```

4. **Authentication → Users → Add user** で、許可するアドレスのユーザーを作ります。Auto Confirm User をオンにします。ダッシュボードがパスワードの入力を求めるときは、パスワードマネージャで作った長い無作為の値を入れます。その値はアプリ、Git、チャットには書きません。アプリからパスワードではログインできません。
5. 上の SQL で、同じアドレスを小文字にして `admin_allowlist` に追加します。Auth のユーザーと許可リストの両方がないと、管理画面には入れません。

管理画面の操作（作成、保存、公開、非公開化）はサーバーアクションです。記事の削除ボタンはありません。

### Vercel へのインポート

1. [Vercel の新しいプロジェクト](https://vercel.com/new) を開きます。
2. この Git リポジトリを Import します。Framework Preset は Next.js のままにします。
3. 本番へ出す前に、下の環境変数を Production と Preview の両方へ入れます。
4. Deploy します。公開サイトのオリジンが決まったら、`NEXT_PUBLIC_SITE_URL` をそのオリジン（末尾のスラッシュなし）に更新して再デプロイします。

### 環境変数

| 名前 | 置く場所 | 内容 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザに出る | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザに出る | 低権限のキー。legacy の `anon`、または publishable key（`sb_publishable_...`）。RLS の範囲だけを読む |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーだけ | 高権限のキー。legacy の `service_role`、または secret key（`sb_secret_...`）。RLS を迂回する。`NEXT_PUBLIC_` は付けない |
| `KURO_API_TOKEN_SHA256` | サーバーだけ | 投稿 API の Bearer トークンそのものではなく、その SHA-256（16進）。差し替え中はカンマ区切りで複数（最大8件）。生のトークンは環境変数にも Git にも置かない |
| `NEXT_PUBLIC_SITE_URL` | ブラウザに出る | サイトのオリジン。ローカルは `http://localhost:3000`。本番は公開 URL |

変数名はこのリポジトリの仕様です。Supabase は `anon` / `service_role` から publishable / secret key へ移っています。どちらも同じ変数に入れます。secret key はブラウザでは拒否されるので、サービス用クライアント（`lib/supabase/service.ts`、`server-only`）以外からは読みません。

`KURO_API_TOKEN_SHA256` は、トークンをシェルの環境変数に載せたうえで次のコマンドの出力を使います。出力のハッシュだけを Vercel に保存します。

```bash
node -e "const {createHash}=require('node:crypto'); const token=process.env.KURO_API_TOKEN; if(!token) process.exit(1); process.stdout.write(createHash('sha256').update(token).digest('hex'))"
```

Vercel では `SUPABASE_SERVICE_ROLE_KEY` と `KURO_API_TOKEN_SHA256` を Sensitive にして、Production と Preview に設定します。Development は各自の `.env.local` です。

### 投稿 API

クロはこの API だけから記事を作り、直します。削除はありません。平文トークンはリクエストの `Authorization` ヘッダー以外に出さず、サーバーは SHA-256 だけと比べます。

| メソッド | パス | 説明 |
| --- | --- | --- |
| `GET` | `/api/kuro/articles?days=14` | 直近の記事（下書きを含む）。slug、title、theme、slot、date、status、出典 URL |
| `POST` | `/api/kuro/articles` | 作成。成功は 201 と `url`、`version` |
| `GET` | `/api/kuro/articles/[slug]` | 1件 |
| `PATCH` | `/api/kuro/articles/[slug]` | 更新。`change_type` と、訂正や公開済みの更新では `change_note` |
| `POST` | `/api/kuro/skips` | 見送り（`date`、`slot`、任意の `reason`） |

`days` を省略すると 14 です。1〜366 の整数以外は 400 です。日付の「今日」は日本時間です。

認証に失敗すると 401 です。理由は分けません。失敗は IP ごとに 1 分 10 回までで、超えると 429 と `Retry-After` です。書き込み（作成、更新、見送り）は 1 時間 20 回、かつ 1 日 60 回までです。形式の違反は 400 と日本語の `errors` です。同じ日・同じ枠に公開済みがある状態で、もう1本公開しようとすると 409 です。

`DELETE` は用意していません。サーバは 405 を返します。データベースの権限でも削除できません。

成功した作成と更新は、記事ページ（`/articles/[slug]`）、トップ（`/`）、テーマ一覧、その日のアーカイブ、フィード、サイトマップのキャッシュを無効化します。

トークンは環境変数 `KURO_API_TOKEN` に置いたうえで送ります。この値は Git やログに残しません。

```bash
curl -sS \
  -H "Authorization: Bearer $KURO_API_TOKEN" \
  "http://localhost:3000/api/kuro/articles?days=14"

curl -sS -X POST \
  -H "Authorization: Bearer $KURO_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @article.json \
  http://localhost:3000/api/kuro/articles

curl -sS -X PATCH \
  -H "Authorization: Bearer $KURO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"change_type":"correction","change_note":"数値を訂正した","title":"告示の数値を訂正"}' \
  http://localhost:3000/api/kuro/articles/2026-12-01-07-example

curl -sS -X POST \
  -H "Authorization: Bearer $KURO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-12-01","slot":"12","reason":"一次情報が足りない"}' \
  http://localhost:3000/api/kuro/skips
```

### プレビューの Vercel Authentication

プレビュー URL は Vercel にログインできる人だけが開けるようにします。本番の公開ドメインは、誰でも記事を読めるように保護しません。

1. Vercel のプロジェクトを開きます。
2. サイドバーの **Security**（項目が無い場合は **Settings**）から **Deployment Protection** を開きます。
3. 保護方法に **Vercel Authentication** を選びます。
4. 保護範囲は **Standard Protection**（本番ドメイン以外のデプロイを保護）にします。**All Deployments** は本番の公開ページまでログイン必須になるので選びません。
5. Save します。

新しいプロジェクトでは保護が最初から有効なことがあります。Preview が保護され、本番ドメインが公開のままであることを確認します。

### Web Analytics と Speed Insights

計測のコードは入っています。`@vercel/analytics` と `@vercel/speed-insights` を公開ページに出します。`/admin` では出しません。ページのURLからは、`?` より後ろを外して送ります。Cookie は使いません。

カスタムイベントは次の3つだけです。URLのクエリ、メールアドレス、記事の全文は入れません。

| イベント | 値 |
| --- | --- |
| `article_view` | `theme`（テーマ）、`slot`（07 / 12 / 17 / 20） |
| `source_click` | `theme`、出典のドメイン |
| `report_error_click` | `theme` |

この変更が本番に入ったあと、社長がダッシュボードで有効にします。リポジトリ側の追加作業はありません。

1. Vercel のプロジェクトを開きます。
2. **Analytics** を開き、**Enable** を押します。
3. **Speed Insights** を開き、有効にします。
4. 本番の記事を1件開きます。出典のリンクと「誤りを報告」を1回ずつ押します。**Analytics** に上の3つのイベントが出ることを確認します。URLに `?` より後ろが残っていないこと、`theme` と `slot`、または出典のドメイン以外の値が無いことを見ます。

月に1回、次を見ます。

- テーマ別・枠別の閲覧数。`article_view` を `theme` と `slot` で分けた件数です。
- 出典クリック率。同じ期間の `source_click` の件数を、`article_view` の件数で割った値です。テーマごとに見るときは、同じ `theme` の件数同士で割ります。

Speed Insights は、公開ページの表示速度を見るために使います。管理画面は対象外です。

このサイトのページから LLM の API は呼びません。
