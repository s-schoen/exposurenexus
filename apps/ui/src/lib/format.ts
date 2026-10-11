export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString();
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
