import { normalizeDateToUtcStart } from "@/lib/utc-date";

export function formatUtcDateOnly(value: Date): string {
  return normalizeDateToUtcStart(value).toISOString().slice(0, 10);
}

export function formatLocalDateTimeInput(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
