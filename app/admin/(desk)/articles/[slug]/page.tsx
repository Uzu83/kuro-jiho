import { notFound } from "next/navigation";
import { ArticleForm } from "@/app/admin/article-form";
import { slotChoices, themeChoices } from "@/app/admin/meta";
import { draftFromArticle } from "@/lib/admin/draft";
import { loadEditable, loadRevisionRows } from "@/lib/admin/queries";
import { revisionViews, statusLabel } from "@/lib/admin/revisions";
import { requireAdmin } from "@/lib/admin/session";
import { ARTICLE_SLUG_PATTERN } from "@/lib/article-schema";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  if (!ARTICLE_SLUG_PATTERN.test(slug)) {
    notFound();
  }

  const article = await loadEditable(slug);
  if (!article) {
    notFound();
  }

  const query = await searchParams;
  const revisions = revisionViews({
    current: {
      title: article.title,
      slug: article.slug,
      theme: article.theme,
      slot: article.slot,
      date: article.date,
      status: article.status,
      summary: article.summary,
      body_md: article.body_md,
      sources: article.sources,
      verification: article.verification,
      related: article.related,
      published_at: article.published_at,
    },
    revisions: await loadRevisionRows(article.id),
  });

  return (
    <>
      <h1>記事を編集</h1>
      <p className="admin-hint">状態：{statusLabel(article.status)}</p>
      {query.saved === "1" ? <p className="admin-ok">保存しました。公開ページの表示を更新しました。</p> : null}
      <ArticleForm
        mode="edit"
        draft={draftFromArticle(article)}
        themes={themeChoices()}
        slots={slotChoices()}
        currentSlug={article.slug}
      />

      <section className="admin-section" aria-labelledby="revisions">
        <h2 id="revisions">改訂履歴</h2>
        {revisions.length === 0 ? <p className="empty-note">履歴はまだありません。</p> : null}
        <ol className="admin-revisions">
          {revisions.map((revision) => (
            <li key={revision.id} className="admin-card">
              <p className="story-meta">
                <span>版 {revision.version}</span>
                <span>{revision.changeLabel}</span>
                <span>{revision.actorLabel}</span>
                <span>{revision.createdLabel}</span>
              </p>
              <p>{revision.note ?? "メモなし"}</p>
              {revision.changes.length === 0 ? <p className="admin-hint">表示できる差分はありません。</p> : null}
              {revision.changes.map((change) => (
                <div key={change.field}>
                  <h3 className="admin-subhead">{change.field}</h3>
                  <pre className="admin-diff">{change.text}</pre>
                </div>
              ))}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
