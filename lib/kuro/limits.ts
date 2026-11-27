import { createHash } from "node:crypto";

/** 書き込みは全体で 1 時間 20 回、1 日 60 回。認証失敗は IP ごとに 1 分 10 回。 */
export const KURO_LIMITS = {
  writeHour: { key: "kuro:write:hour", limit: 20, windowSeconds: 60 * 60 },
  writeDay: { key: "kuro:write:day", limit: 60, windowSeconds: 60 * 60 * 24 },
  authFailure: { limit: 10, windowSeconds: 60 },
} as const;

/**
 * consume_rate_limit と同じく、窓は UNIX 秒を windowSeconds で割った境界。
 * 戻り値は次の境界までの秒数（Retry-After）。
 */
export function retryAfterSeconds(windowSeconds: number, now: Date): number {
  const epoch = Math.floor(now.getTime() / 1000);
  const intoWindow = epoch % windowSeconds;
  return windowSeconds - intoWindow;
}

/** 平文の IP は保存しない。認証失敗のキーは SHA-256 だけ。 */
export function authFailureKey(ip: string): string {
  const digest = createHash("sha256").update(ip, "utf8").digest("hex");
  return `kuro:auth-fail:${digest}`;
}
