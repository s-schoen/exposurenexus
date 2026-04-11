import { describe, expect, it } from "vitest"
import { pino } from "pino"
import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { createApp } from "../app.js"
import health from "./health.js"

describe("GET /health", () => {
  it("returns an ok status payload", async () => {
    const requestId = "test-request-id"
    const emptyRoute = new Hono()
    const passthrough: MiddlewareHandler = async (_c, next) => {
      await next()
    }
    const app = createApp({
      logger: pino({ enabled: false }),
      accessLogger: pino({ enabled: false }),
      authUrl: "http://localhost:3000",
      apiTimeoutMs: 5000,
      annotateAuth: passthrough,
      requireAuth: passthrough,
      healthRoute: health,
      authRoute: emptyRoute,
      assetRoute: emptyRoute,
      vulnerabilityRoute: emptyRoute,
      findingStatsRoute: emptyRoute,
      findingRoute: emptyRoute,
      importerRoute: emptyRoute
    })

    const response = await app.request("/api/health", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Request-Id")).toBe(requestId)
    expect(body.correlationId).toBe(requestId)
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        status: "ok"
      }
    })
  })
})
