import { z } from "zod/v4"

export const dateSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date
}, z.date())
