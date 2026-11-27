import { ARTICLE_THEMES, type ArticleTheme } from "@/lib/article-kinds";

const LOCAL_ORIGIN = "http://localhost:3000";

/** 先頭セグメントがこの名前のパスは、フィードにも計測にも出さない。 */
const PRIVATE_ROOTS = new Set(["admin", "api"]);

/**
 * 設定された公開オリジン。資格情報や不正な値は捨て、ローカルに落とす。
 * 比較は URL の origin だけで行う。
 */
export function siteOrigin(raw?: string | null): string {
  const value = raw === undefined ? process.env.NEXT_PUBLIC_SITE_URL : raw;
  if (!value) {
    return LOCAL_ORIGIN;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin !== "null" &&
      url.username === "" &&
      url.password === ""
    ) {
      return url.origin;
    }
  } catch {
    // 不正な設定はローカルに落とす。
  }

  return LOCAL_ORIGIN;
}

export function isPrivatePath(pathname: string): boolean {
  const segment = pathname.split("/").filter((part) => part.length > 0)[0];
  return segment !== undefined && PRIVATE_ROOTS.has(segment);
}

export function isArticleTheme(value: string): value is ArticleTheme {
  return (ARTICLE_THEMES as readonly string[]).includes(value);
}

/**
 * 同じオリジンのパスだけを絶対 URL にする。クエリとフラグメントは付けない。
 * パスが別オリジンへ解決される場合は捨てる。
 */
export function absolutePublicUrl(origin: string, pathname: string): string | null {
  let site: URL;
  let url: URL;
  try {
    site = new URL(origin);
    url = new URL(pathname, site.origin);
  } catch {
    return null;
  }

  if (url.origin === "null" || url.origin !== site.origin || isPrivatePath(url.pathname)) {
    return null;
  }

  const clean = new URL(url.pathname, url.origin);
  if (clean.origin !== url.origin) {
    return null;
  }
  return clean.toString();
}

/** 計測へ出す URL。クエリ、フラグメント、資格情報、/admin、/api は残さない。 */
export function redactMeasuredUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin === "null") {
    return null;
  }
  if (isPrivatePath(url.pathname)) {
    return null;
  }

  const clean = new URL(url.pathname, url.origin);
  if (clean.origin !== url.origin) {
    return null;
  }
  return clean.toString();
}
