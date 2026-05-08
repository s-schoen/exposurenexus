import { HTTPException } from "hono/http-exception"
import type { Hono } from "hono"
import { createErrorReply } from "@exposurenexus/types/api"
import type { Logger } from "pino"
import type { ContextVariables } from "./hono-schema.js"

export function registerErrorHandler(
  app: Hono<{ Variables: ContextVariables }>,
  logger: Logger
) {
  app.onError((error, c) => {
    const correlationId = c.get("requestId")

    if (error instanceof HTTPException) {
      c.status(error.status)
      return c.json(createErrorReply(correlationId, error.status, error))
    } else {
      logger.error({ error: error.message }, "unhandled exception")
      c.status(500)
      return c.json(
        createErrorReply(correlationId, 500, new Error("internal server error"))
      )
    }
  })
}
