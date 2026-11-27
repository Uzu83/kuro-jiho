import Link from "next/link";
import {
  AI_BANNER,
  EMPTY_THEME_LABEL,
  formatIsoDateLabel,
  HOME_THEMES,
  themeName,
  themePageHref,
  type DaySlot,
  type ListingArticle,
  type ThemeSection,
} from "@/lib/articles/board";
import type { ArticleTheme } from "@/lib/article-schema";

const LEAD =
  "公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。";

type Current = "home" | "archive" | ArticleTheme;

export function SiteHeader({ current }: { current: Current }) {
  return (
    <header className="site-header">
      {current === "home" ? (
        <>
          <p className="kicker">AI記者クロ</p>
          <h1>クロの時報</h1>
          <p className="lead">{LEAD}</p>
        </>
      ) : (
        <p className="article-home">
          <Link href="/">クロの時報</Link>
        </p>
      )}
      <nav aria-label="テーマ">
        <ul>
          <li>
            <Link href="/" aria-current={current === "home" ? "page" : undefined}>
              トップ
            </Link>
          </li>
          {HOME_THEMES.map((theme) => (
            <li key={theme}>
              <Link href={`/${theme}`} aria-current={current === theme ? "page" : undefined}>
                {themeName(theme)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function AiBanner() {
  return <p className="ai-banner">{AI_BANNER}</p>;
}

export function DaySlots({ slots }: { slots: readonly DaySlot[] }) {
  return (
    <ul className="slot-list">
      {slots.map((slot) => (
        <li key={slot.slot} className="slot-card">
          <p className="slot-time">{slot.slot}:00</p>
          {slot.state === "published" ? (
            <>
              <h3>
                <Link href={slot.href}>{slot.title}</Link>
              </h3>
              <p className="slot-state">{slot.themeLabel}</p>
            </>
          ) : (
            <p className="slot-state">{slot.label}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function StoryList({ articles }: { articles: readonly ListingArticle[] }) {
  if (articles.length === 0) {
    return <p className="empty-note">{EMPTY_THEME_LABEL}</p>;
  }

  return (
    <ul className="story-list">
      {articles.map((article) => (
        <li key={article.slug}>
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
          <p className="story-meta">
            <time dateTime={article.date}>{formatIsoDateLabel(article.date)}</time>
            {` ${article.slot}:00`}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function HomeBoard({
  today,
  slots,
  themes,
}: {
  today: string;
  slots: readonly DaySlot[];
  themes: readonly ThemeSection[];
}) {
  return (
    <main>
      <SiteHeader current="home" />
      <AiBanner />
      <section className="theme-block" aria-labelledby="today-heading">
        <h2 id="today-heading" className="section-heading">
          今日の4枠
        </h2>
        <p className="story-meta">
          <Link href={`/archive/${today}`}>
            <time dateTime={today}>{formatIsoDateLabel(today)}（日本時間）</time>
          </Link>
        </p>
        <DaySlots slots={slots} />
      </section>
      {themes.map((theme) => (
        <section key={theme.theme} className="theme-block" aria-labelledby={`theme-${theme.theme}`}>
          <h2 id={`theme-${theme.theme}`}>
            <Link href={theme.href}>{theme.label}</Link>
          </h2>
          <StoryList articles={theme.articles} />
        </section>
      ))}
    </main>
  );
}

export function ThemeBoard({
  theme,
  label,
  page,
  pages,
  articles,
}: {
  theme: ArticleTheme;
  label: string;
  page: number;
  pages: number;
  articles: readonly ListingArticle[];
}) {
  return (
    <main>
      <SiteHeader current={theme} />
      <AiBanner />
      <h1>{label}</h1>
      <StoryList articles={articles} />
      <nav className="pager" aria-label="ページ">
        {page > 1 ? (
          <Link href={themePageHref(theme, page - 1)} rel="prev">
            前のページ
          </Link>
        ) : null}
        <span>
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={themePageHref(theme, page + 1)} rel="next">
            次のページ
          </Link>
        ) : null}
      </nav>
    </main>
  );
}

export function ArchiveBoard({ date, slots }: { date: string; slots: readonly DaySlot[] }) {
  const label = formatIsoDateLabel(date);
  return (
    <main>
      <SiteHeader current="archive" />
      <AiBanner />
      <h1>
        <time dateTime={date}>{label}</time>
      </h1>
      <DaySlots slots={slots} />
    </main>
  );
}
