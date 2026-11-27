import Link from "next/link";
import { slotChoices, statusChoices, themeChoices } from "@/app/admin/meta";
import { requireAdmin } from "@/lib/admin/session";
import {
  buildAdminSlots,
  listAdminArticles,
  listTodayArticles,
  listTodaySkips,
  parseAdminFilters,
} from "@/lib/admin/queries";
import { themeLabel } from "@/lib/articles/public";
import { formatCalendarDate, jstDate } from "@/lib/kuro/dates";
import { statusLabel } from "@/lib/admin/revisions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters = parseAdminFilters(params);
  const today = jstDate(new Date());
  const [articles, todayArticles, skips] = await Promise.all([
    listAdminArticles(filters),
    listTodayArticles(today),
    listTodaySkips(today),
  ]);
  const slots = buildAdminSlots({ articles: todayArticles, skips });
  const saved = params.saved === "1";

  return (
    <>
      <h1>記事一覧</h1>
      {saved ? <p className="admin-ok">保存しました。公開ページの表示を更新しました。</p> : null}

      <section className="admin-section" aria-labelledby="today-slots">
        <h2 id="today-slots">今日の4枠</h2>
        <p className="admin-hint">{formatCalendarDate(today)}（日本時間）</p>
        <ul className="slot-list">
          {slots.map((slot) => (
            <li key={slot.slot} className="slot-card">
              <p className="slot-time">{slot.timeLabel}</p>
              <p className="slot-state">{slot.label}</p>
              {slot.slug && slot.title ? (
                <p className="story-title">
                  <Link href={`/admin/articles/${slot.slug}`}>{slot.title}</Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section" aria-labelledby="article-filter">
        <h2 id="article-filter">絞り込み</h2>
        <form className="admin-filters" action="/admin" method="get">
          <div>
            <label htmlFor="filter-status">状態</label>
            <select id="filter-status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">すべて</option>
              {statusChoices().map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-date">日付</label>
            <input id="filter-date" name="date" type="date" defaultValue={filters.date ?? ""} />
          </div>
          <div>
            <label htmlFor="filter-slot">枠</label>
            <select id="filter-slot" name="slot" defaultValue={filters.slot ?? ""}>
              <option value="">すべて</option>
              {slotChoices().map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-theme">テーマ</label>
            <select id="filter-theme" name="theme" defaultValue={filters.theme ?? ""}>
              <option value="">すべて</option>
              {themeChoices().map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-actions">
            <button type="submit">絞り込む</button>
            <Link href="/admin">条件を外す</Link>
          </div>
        </form>
      </section>

      <section className="admin-section" aria-labelledby="article-list">
        <h2 id="article-list">記事</h2>
        {articles.length === 0 ? <p className="empty-note">該当する記事はありません。</p> : null}
        <ul className="story-list">
          {articles.map((article) => (
            <li key={article.slug} className="story-card">
              <p className="story-meta">
                <time dateTime={article.date}>{formatCalendarDate(article.date)}</time>
                <span>{article.slot}</span>
                <span>{themeLabel(article.theme)}</span>
                <span>{statusLabel(article.status)}</span>
              </p>
              <p className="story-title">
                <Link href={`/admin/articles/${article.slug}`}>{article.title}</Link>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
