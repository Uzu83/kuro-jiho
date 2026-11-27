import { isTrustedMutationOrigin, safeAdminNext } from "@/lib/admin/gate";

export const ADMIN_NEXT_COOKIE = "admin_next";

export const MAGIC_LINK_SENT =
  "メールの送信を受け付けました。届いたリンクを開いてください。届かないときは、時間をおいて再度お試しください。";

export const MAGIC_LINK_INVALID = "メールアドレスの形式を確認してください。";

export const MAGIC_LINK_CONFIG = "ログインの準備ができていません。環境変数を確認してください。";

export const CSRF_MESSAGE = "別のサイトからの送信は受け付けません。";

/** 許可リストの有無で文面を分けない。形式だけを見る。 */
export function normalizeLoginEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) {
    return null;
  }
  if (/\s/.test(email)) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

export type MagicLinkResult =
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "config" }
  | { status: "sent"; next: string };

/**
 * 許可リストにあるときだけ send を呼ぶ。結果の文面は sent に揃える。
 * send の失敗（ユーザー未作成、送信上限）も sent にして、アドレスの有無を返さない。
 */
export async function performMagicLinkRequest(input: {
  origin: string | null;
  host: string | null;
  email: string;
  next: string | null;
  redirectTo: string | null;
  lookup: (email: string) => Promise<boolean>;
  send: (email: string) => Promise<void>;
}): Promise<MagicLinkResult> {
  if (!isTrustedMutationOrigin(input.origin, input.host)) {
    return { status: "forbidden" };
  }

  const email = normalizeLoginEmail(input.email);
  if (!email) {
    return { status: "invalid" };
  }

  const next = safeAdminNext(input.next);
  if (!input.redirectTo) {
    return { status: "config" };
  }

  let allowed = false;
  try {
    allowed = await input.lookup(email);
  } catch {
    return { status: "config" };
  }

  if (allowed) {
    try {
      await input.send(email);
    } catch {
      // 未作成ユーザーや送信失敗でも、同じ完了画面にする。
    }
  }

  return { status: "sent", next };
}
