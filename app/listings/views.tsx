import Link from "next/link";
import { SiteFooter } from "@/app/site/footer";
import { SiteHeader } from "@/app/site/header";
import { themeLabel } from "@/lib/articles/public";
import { formatCalendarDate } from "@/lib/kuro/dates";
import {
  slotClock,
  themePageHref,
  type ArchiveModel,
  type DaySlot,
  type HomeModel,
  type ListingArticle,
  type ThemeModel,
} from "@/lib/listings/model";

export const AI_BANNER = "この記事はすべてAIが書いています";

function Banner() {
  return <p className="site-banner">{AI_BANNER}</p>;
}

type PublishedSlot = Extract<DaySlot, { kind: "published" }>;

/** いちばん新しい公開済みの枠を先頭に大きく出し、残りは枠の順に細い行で並べる。 */
function arrangeSlots(slots: readonly DaySlot[]): { lead: PublishedSlot | null; rest: DaySlot[] } {
  const published = slots.filter((slot): slot is PublishedSlot => slot.kind === "published");
  const lead = published.length > 0 ? published[published.length - 1]! : null;
  return { lead, rest: slots.filter((slot) => slot !== lead) };
}

function LeadSlot({ slot }: { slot: PublishedSlot }) {
  return (
    <li className="slot slot-lead">
      <p className="slot-meta">
        <span className="slot-time">{slot.timeLabel}</span>
        <span className="slot-theme">{themeLabel(slot.article.theme)}</span>
      </p>
      <p className="story-title">
        <Link href={`/articles/${slot.article.slug}`}>{slot.article.title}</Link>
      </p>
      {slot.article.summary ? <p className="story-summary">{slot.article.summary}</p> : null}
    </li>
  );
}

function SlotRow({ slot }: { slot: DaySlot }) {
  return (
    <li className={`slot slot-row slot-row-${slot.kind}`}>
      <span className="slot-time">{slot.timeLabel}</span>
      {slot.kind === "published" ? (
        <p className="slot-text">
          <Link href={`/articles/${slot.article.slug}`}>{slot.article.title}</Link>
          <span className="slot-theme">{themeLabel(slot.article.theme)}</span>
        </p>
      ) : (
        <p className="slot-text">{slot.kind === "scheduled" ? "公開予定" : slot.label}</p>
      )}
    </li>
  );
}

function SlotList({ slots }: { slots: readonly DaySlot[] }) {
  const { lead, rest } = arrangeSlots(slots);
  return (
    <ul className="slot-list">
      {lead ? <LeadSlot slot={lead} /> : null}
      {rest.map((slot) => (
        <SlotRow key={slot.slot} slot={slot} />
      ))}
    </ul>
  );
}

function StoryList({ articles, showTheme }: { articles: readonly ListingArticle[]; showTheme: boolean }) {
  return (
    <ul className="story-list">
      {articles.map((article) => (
        <li key={article.slug} className="story">
          <p className="story-title">
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          </p>
          <p className="story-meta">
            <time dateTime={article.date}>{formatCalendarDate(article.date)}</time>
            <span>{slotClock(article.slot)}</span>
            {showTheme ? <span>{themeLabel(article.theme)}</span> : null}
          </p>
          {article.summary ? <p className="story-summary">{article.summary}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function HomeView({ home }: { home: HomeModel }) {
  return (
    <main className="site-main">
      <SiteHeader titleAsHeading today={{ date: home.date, label: home.dateLabel }} />
      <Banner />
      <p className="lead">
        公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。
      </p>

      <section className="site-section" aria-labelledby="today-heading">
        <h2 id="today-heading">今日の4枠</h2>
        <SlotList slots={home.slots} />
      </section>

      <section className="site-section" aria-labelledby="themes-heading">
        <h2 id="themes-heading">テーマ別の新着</h2>
        {home.themes.map((group) => (
          <section key={group.theme} className="theme-block" aria-labelledby={`theme-${group.theme}`}>
            <h3 id={`theme-${group.theme}`}>
              <Link href={`/${group.theme}`}>{group.label}</Link>
            </h3>
            {group.articles.length === 0 ? (
              <p className="empty-note">まだありません</p>
            ) : (
              <StoryList articles={group.articles} showTheme={false} />
            )}
          </section>
        ))}
      </section>
      <SiteFooter />
    </main>
  );
}

export function ThemeView({ model }: { model: ThemeModel }) {
  return (
    <main className="site-main">
      <SiteHeader current={model.theme} />
      <Banner />
      <h1>{model.label}</h1>
      <p className="lead">新しい順です。</p>
      {model.articles.length === 0 ? (
        <p className="empty-note">このテーマの記事はまだありません</p>
      ) : (
        <StoryList articles={model.articles} showTheme={false} />
      )}
      {model.totalPages > 1 ? (
        <nav className="pager" aria-label="ページ送り">
          {model.page > 1 ? (
            <Link href={themePageHref(model.theme, model.page - 1)} rel="prev">
              前のページ
            </Link>
          ) : (
            <span />
          )}
          <p>
            {model.page} / {model.totalPages}
            <span className="visually-hidden">ページ</span>
          </p>
          {model.page < model.totalPages ? (
            <Link href={themePageHref(model.theme, model.page + 1)} rel="next">
              次のページ
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
      <SiteFooter />
    </main>
  );
}

export function ArchiveView({ archive }: { archive: ArchiveModel }) {
  return (
    <main className="site-main">
      <SiteHeader />
      <Banner />
      <h1>
        <time dateTime={archive.date}>{archive.dateLabel}</time>
      </h1>
      <p className="lead">日本時間の4枠です。</p>
      <SlotList slots={archive.slots} />
      <SiteFooter />
    </main>
  );
}
