import { ArticleForm } from "@/app/admin/article-form";
import { slotChoices, themeChoices } from "@/app/admin/meta";
import { emptyDraft } from "@/lib/admin/draft";
import { requireAdmin } from "@/lib/admin/session";
import { jstDate } from "@/lib/kuro/dates";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  await requireAdmin();

  return (
    <>
      <h1>新しい記事</h1>
      <ArticleForm mode="create" draft={emptyDraft(jstDate(new Date()))} themes={themeChoices()} slots={slotChoices()} />
    </>
  );
}
