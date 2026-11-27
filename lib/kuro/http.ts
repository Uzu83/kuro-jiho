export const NO_STORE = { "cache-control": "no-store" } as const;

export const MESSAGES = {
  unauthorized: "認証に失敗しました",
  rateLimited: "回数の上限を超えています",
  failed: "処理に失敗しました",
  notFound: "記事が見つかりません",
  slotConflict: "同じ日・同じ枠に公開済みの記事があります",
  slugConflict: "同じ slug の記事があります",
  invalidArticleJson: "記事：JSONとして読めません",
  invalidSkipJson: "見送り：JSONとして読めません",
  days: "days：1〜366の整数にしてください",
} as const;

const DEFAULT_DAYS = 14;
const MAX_DAYS = 366;

export function jsonBody(status: number, body: unknown, headers?: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, ...headers },
  });
}

export function jsonError(
  status: number,
  error: string,
  headers?: Record<string, string>,
): Response {
  return jsonBody(status, { error }, headers);
}

export function articlePublicUrl(slug: string, siteUrl: string | undefined): string {
  const path = `/articles/${slug}`;
  if (!siteUrl) {
    return path;
  }

  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return path;
    }
    if (url.username !== "" || url.password !== "") {
      return path;
    }
    return `${url.origin}${path}`;
  } catch {
    return path;
  }
}

export function parseDays(raw: string | null): { ok: true; days: number } | { ok: false } {
  if (raw === null) {
    return { ok: true, days: DEFAULT_DAYS };
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    return { ok: false };
  }
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days > MAX_DAYS) {
    return { ok: false };
  }
  return { ok: true, days };
}

export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const type = request.headers.get("content-type");
  const mime = type?.split(";")[0]?.trim().toLowerCase();
  if (mime !== "application/json") {
    return { ok: false };
  }

  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}
