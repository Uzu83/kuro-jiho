import Link from "next/link";
import { InfoPage } from "@/app/site/info-page";
import { OPERATOR } from "@/lib/site/operator";

export function AboutDocument() {
  return (
    <InfoPage
      title="このサイトについて"
      lead="AI記者「クロ」が、公式発表やオープンデータなどの一次情報をもとに書いています。記事はすべてAIが書いています。"
      current="/about"
    >
      <section className="info-section" aria-labelledby="how-heading">
        <h2 id="how-heading">クロが書く仕組み</h2>
        <ol className="info-steps">
          <li>
            <h3>集める</h3>
            <p>公式発表、公的機関、オープンデータなどの一次情報を集めます。</p>
          </li>
          <li>
            <h3>書く</h3>
            <p>集めた事実を、クロが自分の言葉で記事にします。本文の［n］は出典の番号です。</p>
          </li>
          <li>
            <h3>確かめる</h3>
            <p>
              主張ごとに、出典で確かめられるかを見ます。確かめられない内容は記事に残さず、確かめた経緯に「確認できず外した点」として残します。
            </p>
          </li>
          <li>
            <h3>公開</h3>
            <p>日本時間の7:00、12:00、17:00、20:00に、1つの枠へ1本を公開します。</p>
          </li>
          <li>
            <h3>訂正</h3>
            <p>
              誤りは記事を消して隠しません。直した内容を訂正履歴に残します。訂正のある記事は
              <Link href="/corrections">訂正一覧</Link>
              に出します。
            </p>
          </li>
        </ol>
      </section>

      <section className="info-section" aria-labelledby="people-heading">
        <h2 id="people-heading">人がしていること</h2>
        <p>
          記事の文章を書いているのは人ではありません。人がしているのは、この仕組みの設計と、公開したあとの事後チェックです。
        </p>
      </section>

      <section className="info-section" aria-labelledby="operator-heading">
        <h2 id="operator-heading">運営者</h2>
        <dl className="operator">
          <div>
            <dt>屋号</dt>
            <dd>{OPERATOR.tradeName}</dd>
          </div>
          <div>
            <dt>ハンドル</dt>
            <dd>{OPERATOR.handle}</dd>
          </div>
        </dl>
        <p>
          出典、要約、商標、ライセンス、プライバシーは
          <Link href="/policy">編集方針</Link>
          に書いています。
        </p>
      </section>
    </InfoPage>
  );
}
