import Link from "next/link";
import type { ArticleTheme } from "@/lib/article-schema";
import { themeLabel } from "@/lib/articles/public";
import { formatCalendarDate } from "@/lib/kuro/dates";
import {
  LISTING_THEMES,
  slotClock,
  themePageHref,
  type ArchiveModel,
  type DaySlot,
  type HomeModel,
  type ListingArticle,
  type ThemeModel,
} from "@/lib/listings/model";

export const AI_BANNER = "この記事はすべてAIが書いています";

function SiteHeader({
  titleAsHeading = false,
  current,
}: {
  titleAsHeading?: boolean;
  current?: ArticleTheme;
}) {
  const brand = <Link href="/">クロの時報</Link>;

  return (
    <header className="site-header">
      <p className="kicker">AI記者クロ</p>
      {titleAsHeading ? <h1>{brand}</h1> : <p className="site-brand">{brand}</p>}
      <nav aria-label="テーマ">
        <ul className="site-nav">
          {LISTING_THEMES.map((theme) => (
            <li key={theme}>
              <Link href={`/${theme}`} aria-current={theme === current ? "page" : undefined}>
                {themeLabel(theme)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function Banner() {
  return <p className="site-banner">{AI_BANNER}</p>;
}

function SlotCard({ slot }: { slot: DaySlot }) {
  return (
    <li className={`slot-card slot-card-${slot.kind}`}>
      <p className="slot-time">{slot.timeLabel}</p>
      {slot.kind === "published" ? (
        <>
          <p className="slot-theme">{themeLabel(slot.article.theme)}</p>
          <p className="story-title">
            <Link href={`/articles/${slot.article.slug}`}>{slot.article.title}</Link>
          </p>
          {slot.article.summary ? <p className="story-summary">{slot.article.summary}</p> : null}
        </>
      ) : (
        <p className="slot-state">{slot.label}</p>
      )}
    </li>
  );
}

function SlotList({ slots }: { slots: readonly DaySlot[] }) {
  return (
    <ul className="slot-list">
      {slots.map((slot) => (
        <SlotCard key={slot.slot} slot={slot} />
      ))}
    </ul>
  );
}

function StoryList({ articles, showTheme }: { articles: readonly ListingArticle[]; showTheme: boolean }) {
  return (
    <ul className="story-list">
      {articles.map((article) => (
        <li key={article.slug} className="story-card">
          <p className="story-meta">
            <time dateTime={article.date}>{formatCalendarDate(article.date)}</time>
            <span>{slotClock(article.slot)}</span>
            {showTheme ? <span>{themeLabel(article.theme)}</span> : null}
          </p>
          <p className="story-title">
            <Link href={`/articles/${article.slug}`}>{article.title}</Link>
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
      <SiteHeader titleAsHeading />
      <Banner />
      <p className="lead">
        公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。
      </p>

      <section className="site-section" aria-labelledby="today-heading">
        <h2 id="today-heading">今日の4枠</h2>
        <p className="day-line">
          <Link href={`/archive/${home.date}`}>
            <time dateTime={home.date}>{home.dateLabel}</time>
          </Link>
          （日本時間）
        </p>
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
    </main>
  );
}
