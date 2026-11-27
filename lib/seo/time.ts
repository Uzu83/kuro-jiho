const TOKYO = "Asia/Tokyo";

function parts(value: string, options: Intl.DateTimeFormatOptions): Record<string, string> | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", { timeZone: TOKYO, ...options }).formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

/** 構造化データ用。日本時間のオフセット付き。24時は 00 にする。 */
export function formatJstTimestamp(value: string): string | null {
  const map = parts(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  if (!map?.year || !map.month || !map.day || map.hour === undefined || !map.minute || !map.second) {
    return null;
  }

  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}+09:00`;
}

/** RSS の pubDate。RFC 822、日本時間。 */
export function formatRfc822Jst(value: string): string | null {
  const map = parts(value, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  if (!map?.weekday || !map.year || !map.month || !map.day || map.hour === undefined || !map.minute || !map.second) {
    return null;
  }

  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.weekday}, ${map.day} ${map.month} ${map.year} ${hour}:${map.minute}:${map.second} +0900`;
}
