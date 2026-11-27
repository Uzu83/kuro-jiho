const TOKYO = "Asia/Tokyo";

/** 日本時間の暦日。サーバーのタイムゾーンには依存しない。 */
export function jstDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 実在する YYYY-MM-DD だけを受け付ける。存在しない日は繰り上げない。 */
export function isIsoDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/** date 列が時刻付きで返っても、先頭の暦日だけを使う。 */
export function calendarDate(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match?.[1] || !isIsoDate(match[1])) {
    return null;
  }
  return match[1];
}

export function addIsoDays(isoDate: string, days: number): string {
  if (!isIsoDate(isoDate)) {
    throw new Error("invalid date");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error("invalid date");
  }

  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 今日を含む days 日分の開始日。 */
export function recentSince(now: Date, days: number): string {
  return addIsoDays(jstDate(now), -(days - 1));
}
