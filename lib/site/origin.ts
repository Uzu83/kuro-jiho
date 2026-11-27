const LOCAL_ORIGIN = "http://localhost:3000";

/** オリジンだけを返す。パスとクエリは使わない。ユーザー情報があるときは null。 */
export function siteOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 300) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "") {
    return null;
  }
  if (url.hostname === "" || url.hostname.includes("@")) {
    return null;
  }

  return url.origin;
}

function vercelOrigin(): string | null {
  const host = process.env.VERCEL_URL;
  if (!host) {
    return null;
  }
  return siteOrigin(host);
}

/**
 * 公開URLのオリジン。NEXT_PUBLIC_SITE_URL を優先し、
 * リクエストのオリジン、Vercel が付けるホスト、ローカルの順に落とす。
 */
export function resolveSiteOrigin(fallback?: string | null): string {
  return siteOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? siteOrigin(fallback) ?? vercelOrigin() ?? LOCAL_ORIGIN;
}
