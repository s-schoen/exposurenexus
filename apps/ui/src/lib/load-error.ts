import { notFound } from "@tanstack/react-router";

import { isMissingRecordError } from "@/lib/format.ts";

/**
 * Loads a detail route's record. A missing record throws the router's `notFound()`, so the route's
 * `notFoundComponent` shows instead of the error state.
 */
export async function loadRecord<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (isMissingRecordError(error)) {
      throw notFound();
    }
    throw error;
  }
}
