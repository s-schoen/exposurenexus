import { Hono } from "hono"
import { requestId } from "hono/request-id"
import { describe, expect, it } from "vitest"
import health from "./health.js"

describe("GET /health", () => {
  it("returns an ok status payload", async () => {
    const app = new Hono()

    app.use("*", requestId())
    app.route("/health", health)

    const response = await app.request("/health")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Request-Id")).toEqual(body.correlationId)
    expect(body).toEqual({
      correlationId: expect.any(String),
      data: {
        status: "ok"
      }
    })
  })
})
