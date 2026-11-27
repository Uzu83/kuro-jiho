const TOKYO = "Asia/Tokyo";

/** YYYY-MM-DD の実在する暦日。サーバーのローカルタイムゾーンは見ない。 */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 暦日の表示。時刻のタイムゾーン変換はしない。 */
export function formatCalendarDate(isoDate: string): string {
  if (!isIsoDate(isoDate)) {
    return isoDate;
  }

  const [year, month, day] = isoDate.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

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
