import { ApiError, replyError } from "../lib/api-error.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { MiddlewareHandler } from "hono";

/**
 * Guards the import content upload (`PUT /api/findings/import/:importSourceId/content`),
 * which streams large files and therefore needs different lifetime rules than
 * ordinary API requests:
 *
 * - Applies its own, longer timeout instead of the short default API timeout
 *   (see `api.use("*", ...)` in `app.ts`), and cancels the work when it expires.
 * - Propagates an `AbortSignal` combining client disconnect, timeout, and
 *   shutdown through `importUploadSignal`, which the import route passes to
 *   `ingestions.submit`.
 * - Tracks in-flight uploads so `close()` can wait for them to settle during
 *   graceful shutdown instead of dropping them when the socket closes.
 *
 * Unlike Hono's `timeout` middleware, it aborts the underlying work and awaits
 * its settlement before sending the error reply, so no orphaned ingestion runs
 * after the response.
 */
export function createImportUploads(timeoutMs: number) {
  const shutdown = new AbortController();
  const active = new Set<Promise<void>>();
  const middleware: MiddlewareHandler<{ Variables: ContextVariables }> = async (c, next) => {
    if (shutdown.signal.aborted) throw new ApiError(503, "API is shutting down");
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    const signal = AbortSignal.any([c.req.raw.signal, deadline.signal, shutdown.signal]);
    c.set("importUploadSignal", signal);
    const settled = Promise.withResolvers<void>();
    active.add(settled.promise);
    try {
      // Unlike a timeout race, abort the work and await its settlement before replying.
      await next();
      if (signal.aborted) {
        c.res = replyError(
          c,
          new ApiError(
            deadline.signal.aborted ? 504 : shutdown.signal.aborted ? 503 : 400,
            "Import upload cancelled",
          ),
        );
      }
    } finally {
      clearTimeout(timer);
      active.delete(settled.promise);
      settled.resolve();
    }
  };
  return {
    middleware,
    close: async () => {
      shutdown.abort();
      // A disconnected socket can close before its upload/finalization has settled.
      await Promise.all(active);
    },
  };
}
