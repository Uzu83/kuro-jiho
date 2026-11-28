import Link from "next/link";
import type { ArticleTheme } from "@/lib/article-schema";
import { themeLabel } from "@/lib/articles/public";
import { LISTING_THEMES } from "@/lib/listings/model";

/** 題字・日付・テーマナビ。トップは題字を h1 にし、今日の日付をアーカイブへのリンクにする。 */
export function SiteHeader({
  titleAsHeading = false,
  current,
  today,
  withNav = true,
}: {
  titleAsHeading?: boolean;
  current?: ArticleTheme;
  today?: { date: string; label: string };
  withNav?: boolean;
}) {
  const brand = <Link href="/">クロの時報</Link>;

  return (
    <header className="site-header">
      <div className="site-masthead">
        {titleAsHeading ? <h1>{brand}</h1> : <p className="site-brand">{brand}</p>}
        <p className="site-dateline">
          <span>AI記者クロ</span>
          {today ? (
            <Link href={`/archive/${today.date}`}>
              <time dateTime={today.date}>{today.label}</time>
            </Link>
          ) : null}
        </p>
      </div>
      {withNav ? (
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
      ) : null}
    </header>
  );
}
