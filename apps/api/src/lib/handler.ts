import { isApplicationError } from "@exposurenexus/backend";
import { HTTPException } from "hono/http-exception";

import { internalServerError, isApiError, replyError } from "./api-error.js";

import type { ContextVariables } from "./hono-schema.js";
import type { Hono } from "hono";
import type { Logger } from "pino";

export function registerErrorHandler(app: Hono<{ Variables: ContextVariables }>, logger: Logger) {
  app.onError((error, c) => {
    if (isApiError(error) || isApplicationError(error) || error instanceof HTTPException) {
      return replyError(c, error);
    }

    logger.error({ error: error.message }, "unhandled exception");
    return replyError(c, internalServerError());
  });
}
