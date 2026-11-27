const TOKYO = "Asia/Tokyo";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function tokyoParts(value: string): { year: string; month: string; day: string; hour: string; minute: string; second: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  let hour = pick("hour");
  const minute = pick("minute");
  const second = pick("second");
  if (!year || !month || !day || hour === undefined || minute === undefined || second === undefined) {
    return null;
  }
  if (hour === "24") {
    hour = "00";
  }

  return { year, month, day, hour, minute, second };
}

/** 構造化データ用。日本は通年 +09:00。 */
export function formatJstOffset(value: string): string | null {
  const parts = tokyoParts(value);
  if (!parts) {
    return null;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

/** RSS の pubDate。タイムゾーンは +0900。 */
export function formatRfc822Jst(value: string): string | null {
  const parts = tokyoParts(value);
  if (!parts) {
    return null;
  }

  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    weekday: "short",
  }).format(date);
  const monthIndex = Number(parts.month) - 1;
  const month = MONTHS[monthIndex];
  if (!month || !WEEKDAYS.includes(weekday as (typeof WEEKDAYS)[number])) {
    return null;
  }

  return `${weekday}, ${parts.day} ${month} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} +0900`;
}
