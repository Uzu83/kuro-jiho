import type { ReactNode } from "react";
import { InfoPage } from "@/app/site/info-page";

const FUKUOKA_HOME = "https://www.city.fukuoka.lg.jp/";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/deed.ja";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden">（新しいタブで開く）</span>
    </a>
  );
}

export function PolicyDocument() {
  return (
    <InfoPage
      title="編集方針"
      lead="何を出典にするか、どう要約するか、誤りをどう残すかを書いています。"
      current="/policy"
    >
      <section className="info-section" aria-labelledby="sources-policy-heading">
        <h2 id="sources-policy-heading">出典</h2>
        <p>使うのは一次情報だけです。公式発表、公的機関、オープンデータです。新聞社の記事と写真は使いません。</p>
        <p>
          福岡市のウェブサイトへリンクするときは、トップページだけにします。
        </p>
        <p>
          <ExternalLink href={FUKUOKA_HOME}>{FUKUOKA_HOME}</ExternalLink>
        </p>
      </section>

      <section className="info-section" aria-labelledby="summary-policy-heading">
        <h2 id="summary-policy-heading">要約と引用</h2>
        <p>
          事実は自分の言葉で短く要約し、出典にリンクします。記事本文の転載や、語順を変えただけの書き写しはしません。必要な範囲だけを引用します。本文の［n］は、出典欄の同じ番号です。
        </p>
      </section>

      <section className="info-section" aria-labelledby="correction-policy-heading">
        <h2 id="correction-policy-heading">訂正</h2>
        <p>
          誤りは消しません。直すときは、日時と内容を記事の訂正履歴に残します。訂正のある記事は訂正一覧にも出します。
        </p>
      </section>

      <section className="info-section" aria-labelledby="limit-heading">
        <h2 id="limit-heading">AIの限界</h2>
        <p>
          クロは、一次情報を読み違えたり、必要な数字や条件を落とすことがあります。出典、確かめた経緯、訂正履歴を付けているのはそのためです。出典で確かめられないことは書きません。
        </p>
      </section>

      <section className="info-section" aria-labelledby="trademark-heading">
        <h2 id="trademark-heading">商標</h2>
        <p>「F1」などの名称は、各権利者の商標です。本サイトは非公式で、公式団体とは関係ありません。</p>
      </section>

      <section className="info-section" aria-labelledby="license-heading">
        <h2 id="license-heading">記事のライセンス</h2>
        <p>
          記事は <ExternalLink href={CC_BY}>CC BY 4.0</ExternalLink> です。クレジットを表示すれば、複製や翻案ができます。
        </p>
        <p>サイトのプログラムは、記事とは別のライセンスです。</p>
      </section>

      <section className="info-section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">プライバシー</h2>
        <p>読者の個人情報は集めません。会員登録はありません。</p>
        <p>Vercel Web Analytics と Speed Insights は Cookieなしです。</p>
        <p>
          誤り報告は、記事ページの「誤りを報告」から開く GitHub のフォームです。開いた記事のURLが入ります。項目は記事のURL、誤りの箇所、根拠のURLだけです。
        </p>
      </section>
    </InfoPage>
  );
}
