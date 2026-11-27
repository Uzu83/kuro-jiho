import { ARTICLE_SLOTS, type ArticleSlot, type ArticleTheme } from "@/lib/article-kinds";
import { isArticleTheme, redactMeasuredUrl } from "@/lib/seo/public-url";

export const ARTICLE_VIEW = "article_view";
export const SOURCE_CLICK = "source_click";
export const REPORT_ERROR_CLICK = "report_error_click";

function isArticleSlot(value: string): value is ArticleSlot {
  return (ARTICLE_SLOTS as readonly string[]).includes(value);
}

/** ページビューとカスタムイベントの URL から、クエリと非公開パスを落とす。 */
export function redactAnalyticsEvent<T extends { url: string }>(event: T): T | null {
  const url = redactMeasuredUrl(event.url);
  if (!url) {
    return null;
  }
  return { ...event, url };
}

export function articleViewProps(
  theme: string,
  slot: string,
): { theme: ArticleTheme; slot: ArticleSlot } | null {
  if (!isArticleTheme(theme) || !isArticleSlot(slot)) {
    return null;
  }
  return { theme, slot };
}

/** 出典はホスト名だけ。パス、クエリ、利用者名は送らない。https だけ。 */
export function sourceClickProps(
  theme: string,
  sourceUrl: string,
): { theme: ArticleTheme; domain: string } | null {
  if (!isArticleTheme(theme)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname === "" ||
    url.origin === "null"
  ) {
    return null;
  }

  return { theme, domain: url.hostname };
}

export function reportErrorProps(theme: string): { theme: ArticleTheme } | null {
  if (!isArticleTheme(theme)) {
    return null;
  }
  return { theme };
}
