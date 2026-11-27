import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_HASHES = 8;
const MAX_TOKEN_LENGTH = 512;

/**
 * KURO_API_TOKEN_SHA256。Next がビルド時に値を埋め込まないよう、
 * キーは実行時に連結して読む。平文トークンは環境変数に置かない。
 */
export function readKuroTokenSha256(): string | undefined {
  const name = ["KURO", "API", "TOKEN", "SHA256"].join("_");
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** カンマ区切り。空白と不正な桁は無視する。差し替え用に複数可。 */
export function parseTokenHashes(raw: string | undefined): Buffer[] {
  if (!raw) {
    return [];
  }

  const hashes: Buffer[] = [];
  for (const part of raw.split(",")) {
    if (hashes.length >= MAX_HASHES) {
      break;
    }
    const hex = part.trim().toLowerCase();
    if (!SHA256_HEX.test(hex)) {
      continue;
    }
    hashes.push(Buffer.from(hex, "hex"));
  }
  return hashes;
}

export function readBearerToken(header: string | null): string | null {
  if (header === null) {
    return null;
  }

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return null;
  }

  const token = header.slice(prefix.length);
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH || /\s/u.test(token)) {
    return null;
  }

  return token;
}

/**
 * 受け取ったトークンの SHA-256 と、設定済みハッシュを timingSafeEqual で比べる。
 * 一致した時点で戻らず、登録されたハッシュをすべて比較する。
 * 平文同士は比べない。
 */
export function bearerTokenMatches(token: string, hashes: readonly Buffer[]): boolean {
  if (hashes.length === 0) {
    return false;
  }

  const digest = createHash("sha256").update(token, "utf8").digest();
  let matched = 0;
  for (const expected of hashes) {
    if (expected.length !== digest.length) {
      continue;
    }
    matched |= timingSafeEqual(digest, expected) ? 1 : 0;
  }
  return matched === 1;
}

export function clientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  const candidate = realIp || firstForwarded || "unknown";
  if (candidate.length === 0 || candidate.length > 200 || /[\r\n]/.test(candidate)) {
    return "unknown";
  }
  return candidate;
}
