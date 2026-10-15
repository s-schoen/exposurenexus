import { ZodError } from "zod/v4";

import { APIError } from "@/lib/api-client.ts";

export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * A date in the full format, such as "Jan 8, 2026", for property values, editors and forms.
 * Pass `timeZone: "UTC"` for date-only values such as due dates.
 */
export function formatDate(date: Date, { timeZone }: { timeZone?: "UTC" } = {}) {
  return date.toLocaleDateString(undefined, { dateStyle: "medium", timeZone });
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

const FALLBACK_LOAD_ERROR = "Something went wrong while loading this page.";

/**
 * Whether a read failed because the record isn't there: a 404, or the 400 the API answers a
 * malformed id with.
 */
export function isMissingRecordError(error: unknown): boolean {
  return error instanceof APIError && (error.statusCode === 404 || error.statusCode === 400);
}

/** One readable sentence for a failed read, without HTTP or parser jargon. */
export function formatLoadError(error: unknown): string {
  if (error instanceof APIError) {
    if (error.statusCode === 403) {
      return "You don't have permission to view this.";
    }
    if (error.statusCode >= 500) {
      return "The server ran into a problem. Try again in a moment.";
    }
    if (!error.message.trim()) {
      return FALLBACK_LOAD_ERROR;
    }
    const message = capitalizeFirstLetter(error.message.trim());
    return /[.!?]$/.test(message) ? message : `${message}.`;
  }

  if (error instanceof ZodError) {
    return "The server sent a reply the app doesn't understand.";
  }

  // fetch() rejects with a TypeError when the request never reaches the server.
  if (error instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  return FALLBACK_LOAD_ERROR;
}
