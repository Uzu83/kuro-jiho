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

認証に失敗すると 401 です。理由は分けません。失敗は全体で 1 分 60 回まで、かつ IP ごとに 1 分 10 回までで、超えると 429 と `Retry-After` です。全体の上限に達したアドレスは、IP ごとの行を増やしません。窓が終わった制限の行は、次の失敗か書き込みのときに消します。書き込み（作成、更新、見送り）は 1 時間 20 回、かつ 1 日 60 回までです。形式の違反は 400 と日本語の `errors` です。同じ日・同じ枠に公開済みがある状態で、もう1本公開しようとすると 409 です。更新は、取得したときの `version` と一致するときだけ適用します。その間に別の更新があると 409 なので、取り直してから送り直します。

`DELETE` は用意していません。サーバは 405 を返します。データベースの権限でも削除できません。

成功した作成と更新は、記事ページ（`/articles/[slug]`）、トップ（`/`）、テーマ一覧、その日のアーカイブ、フィードのキャッシュを無効化します。

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

計測は Cookie を使いません。有効化は社長がダッシュボードで行います。

1. プロジェクトの **Analytics** を開き、**Enable** を押します。
2. プロジェクトの **Speed Insights** を開き、有効にします。
3. アプリ側の計測コンポーネント（`@vercel/analytics` と `@vercel/speed-insights`）は別の変更でコードに入ります。ダッシュボードを有効にしたあと、そのコードを含むデプロイが計測を始めます。

このサイトのページから LLM の API は呼びません。
