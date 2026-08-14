import { z } from "zod/v4";

export function normalizeDateToUtcStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const dateSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}, z.date());

export const utcStartDateSchema = dateSchema.transform(normalizeDateToUtcStart);
