import { isArticleSlot, isArticleTheme } from "@/lib/listings/model";
import { isAdminPath } from "@/lib/admin/gate";

/** カスタムイベントはこの3つだけ。値は theme / slot / 出典ドメイン。 */
export const ANALYTICS_EVENTS = {
  articleView: "article_view",
  sourceClick: "source_click",
  reportErrorClick: "report_error_click",
} as const;

const ALLOWED_KEYS = new Set(["theme", "slot", "domain"]);
const PUBLIC_TOKEN = /^[a-z0-9.-]+$/;

export type PublicAnalyticsEvent = {
  name: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
  props: Record<string, string>;
};

function isPublicDomain(value: string): boolean {
  if (!PUBLIC_TOKEN.test(value) || value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
    return false;
  }
  return value.includes(".") || value === "localhost";
}

/** track に渡してよい形だけを通す。クエリ、パス、メール、余ったキーは落とす。 */
export function isPublicAnalyticsPayload(props: Record<string, string>): boolean {
  const keys = Object.keys(props);
  if (keys.length === 0 || keys.length > 2 || new Set(keys).size !== keys.length) {
    return false;
  }
  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key)) {
      return false;
    }
  }

  if (!("theme" in props) || !isArticleTheme(props.theme)) {
    return false;
  }
  const hasSlot = "slot" in props;
  const hasDomain = "domain" in props;
  if (hasSlot && hasDomain) {
    return false;
  }
  if (hasSlot && !isArticleSlot(props.slot ?? "")) {
    return false;
  }
  if (hasDomain && !isPublicDomain(props.domain ?? "")) {
    return false;
  }
  return true;
}

export function articleViewEvent(theme: string, slot: string): PublicAnalyticsEvent | null {
  const props = { theme, slot };
  if (!isPublicAnalyticsPayload(props)) {
    return null;
  }
  return { name: ANALYTICS_EVENTS.articleView, props };
}

/** 出典URLからホスト名だけを取る。パス、クエリ、ユーザー情報は捨てる。 */
export function sourceDomain(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return null;
  }

  const domain = url.hostname.toLowerCase();
  return isPublicDomain(domain) ? domain : null;
}

export function sourceClickEvent(theme: string, sourceUrl: string): PublicAnalyticsEvent | null {
  const domain = sourceDomain(sourceUrl);
  if (!domain) {
    return null;
  }
  const props = { theme, domain };
  if (!isPublicAnalyticsPayload(props)) {
    return null;
  }
  return { name: ANALYTICS_EVENTS.sourceClick, props };
}

export function reportErrorClickEvent(theme: string): PublicAnalyticsEvent | null {
  const props = { theme };
  if (!isPublicAnalyticsPayload(props)) {
    return null;
  }
  return { name: ANALYTICS_EVENTS.reportErrorClick, props };
}

export function eventFromArticleClick(input: {
  theme: string;
  marker: string | null;
  href: string | null;
}): PublicAnalyticsEvent | null {
  if (input.marker === ANALYTICS_EVENTS.sourceClick) {
    if (!input.href) {
      return null;
    }
    return sourceClickEvent(input.theme, input.href);
  }
  if (input.marker === ANALYTICS_EVENTS.reportErrorClick) {
    return reportErrorClickEvent(input.theme);
  }
  return null;
}

/** ページビューのURL。管理画面は送らず、クエリとフラグメントは付けない。 */
export function cleanAnalyticsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "") {
    return null;
  }
  if (isAdminPath(url.pathname) || url.pathname.includes("@")) {
    return null;
  }

  url.search = "";
  url.hash = "";
  const cleaned = `${url.origin}${url.pathname}`;
  if (cleaned.includes("?") || cleaned.includes("#") || cleaned.includes("@")) {
    return null;
  }
  return cleaned;
}

export function cleanAnalyticsRoute(route: string): string | null {
  const path = route.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/") || isAdminPath(path) || path.includes("@") || path.includes("?")) {
    return null;
  }
  return path;
}

export function beforeAnalyticsEvent<T extends { url: string }>(event: T): T | null {
  const url = cleanAnalyticsUrl(event.url);
  if (!url) {
    return null;
  }
  return { ...event, url };
}

export function beforeSpeedInsightEvent<T extends { url: string; route?: string }>(event: T): T | null {
  const url = cleanAnalyticsUrl(event.url);
  if (!url) {
    return null;
  }
  if (event.route === undefined) {
    return { ...event, url };
  }
  const route = cleanAnalyticsRoute(event.route);
  if (!route) {
    return null;
  }
  return { ...event, url, route };
}
