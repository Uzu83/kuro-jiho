import Link from "next/link";
import { ArticleViewBeacon, ReportErrorLink, SourceOutboundLink } from "@/app/articles/[slug]/article-events";
import type { PublicArticle } from "@/lib/articles/public";

const AI_LABEL = "この記事はAI記者クロが公式発表をもとに作成しました。";
const AI_LINK = "誤りがあればお知らせください";

export function ArticleDocument({ article }: { article: PublicArticle }) {
  const corrected = article.corrections.length > 0;

  return (
    <main className="article-main">
      <article className="article">
        <ArticleViewBeacon theme={article.theme} slot={article.slot} />
        <header className="article-header">
          <p className="article-home">
            <Link href="/">クロの時報</Link>
          </p>
          <p className="kicker">{article.themeLabel}</p>
          <div className="article-heading">
            <h1>{article.title}</h1>
            {corrected ? (
              <a className="article-badge" href="#corrections">
                訂正あり
              </a>
            ) : null}
          </div>
          <p className="article-times">
            <time dateTime={article.publishedAt}>公開 {article.publishedLabel}</time>
            <time dateTime={article.updatedAt}>更新 {article.updatedLabel}</time>
          </p>
          <p className="article-ai">
            {AI_LABEL}<Link href="/about">{AI_LINK}</Link>
          </p>
        </header>

        <ul className="article-summary" aria-label="3行要約">
          {article.summary.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>

        {/* bodyHtml は renderArticleBody 済み。生の HTML はここに来ない。 */}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />

        <section id="sources" className="article-section" aria-labelledby="sources-heading">
          <h2 id="sources-heading">出典</h2>
          <ol className="article-sources">
            {article.sources.map((source) => (
              <li
                key={source.id}
                id={`source-${source.id}`}
                className="article-source"
                value={Number(source.id)}
              >
                <p className="article-source-heading">
                  <span className="article-source-index">［{source.id}］</span>
                  <cite>{source.title}</cite>
                </p>
                <p>発行元：{source.publisher}</p>
                {source.url ? (
                  <p>
                    <SourceOutboundLink href={source.url} theme={article.theme}>
                      {source.url}
                      <span className="visually-hidden">（新しいタブで開く）</span>
                    </SourceOutboundLink>
                  </p>
                ) : (
                  <p>URLは表示できません</p>
                )}
                {source.accessedLabel ? (
                  <p>
                    確認：
                    <time dateTime={source.accessedAt ?? undefined}>{source.accessedLabel}</time>
                  </p>
                ) : null}
                {source.license ? <p>ライセンス：{source.license}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="article-section" aria-labelledby="verification-heading">
          <h2 id="verification-heading">確かめた経緯</h2>
          <details className="article-details">
            <summary>確認した点と、確認できず外した点</summary>
            <h3>確認した点</h3>
            {article.checked.length === 0 ? (
              <p>確認した点はありません。</p>
            ) : (
              <ul>
                {article.checked.map((item, index) => (
                  <li key={`${index}-${item.claim}`}>
                    {item.claim}
                    {item.sourceIds.length > 0 ? (
                      <>
                        {" "}
                        （出典
                        {item.sourceIds.map((id) => (
                          <a key={id} href={`#source-${id}`}>
                            ［{id}］
                          </a>
                        ))}
                        ）
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <h3>確認できず外した点</h3>
            {article.removed.length === 0 ? (
              <p>確認できず外した点はありません。</p>
            ) : (
              <ul>
                {article.removed.map((item, index) => (
                  <li key={`${index}-${item.claim}`}>
                    {item.claim}
                    {item.reason ? `（${item.reason}）` : null}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>

        <section id="corrections" className="article-section" aria-labelledby="corrections-heading">
          <h2 id="corrections-heading">訂正・更新履歴</h2>
          {corrected ? (
            <ol className="article-corrections">
              {article.corrections.map((correction) => (
                <li key={correction.id}>
                  <time dateTime={correction.createdAt}>{correction.label}</time>
                  <p>{correction.note}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>訂正はまだありません。</p>
          )}
        </section>

        {article.related.length > 0 ? (
          <section className="article-section" aria-labelledby="related-heading">
            <h2 id="related-heading">関連する記事</h2>
            <ul className="article-related">
              {article.related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/articles/${item.slug}`}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="article-report">
          <ReportErrorLink href={article.reportHref} theme={article.theme} />
        </p>
      </article>
    </main>
  );
}
