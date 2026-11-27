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

export function addIsoDays(isoDate: string, days: number): string {
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
