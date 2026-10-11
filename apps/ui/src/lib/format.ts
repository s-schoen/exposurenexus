export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString();
}

/** A date with its time, such as "Jan 8, 2026, 1:30 PM", for audit lines and timestamps. */
export function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * A compact date for list chips: "Feb 1", with the year only when it isn't the current one.
 * Pass `timeZone: "UTC"` for date-only values such as due dates.
 */
export function formatShortDate(
  date: Date,
  { timeZone, today = new Date() }: { timeZone?: "UTC"; today?: Date } = {},
) {
  const year = (value: Date) => (timeZone ? value.getUTCFullYear() : value.getFullYear());

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: year(date) === year(today) ? undefined : "numeric",
    timeZone,
  });
}

const relativeTimeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** A timeline time such as "2 days ago" or "yesterday", in the largest whole unit. */
export function formatRelativeTime(date: Date, now = new Date()) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  for (const [unit, unitSeconds] of relativeTimeUnits) {
    if (Math.abs(seconds) >= unitSeconds) {
      return format.format(Math.trunc(seconds / unitSeconds), unit);
    }
  }

  return format.format(0, "minute");
}
