import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { createTestUser } from "../test/app.js"
import type { ContextVariables } from "./hono-schema.js"
import { requestEventContext } from "./request-event-context.js"

describe("requestEventContext", () => {
  it("creates event context with actor and correlation id", async () => {
    const user = createTestUser()
    const app = new Hono<{ Variables: ContextVariables }>()

    app.get("/", (c) => {
      c.set("requestId", "request-1")
      c.set("user", user)
      return c.json(requestEventContext(c))
    })

    await expect((await app.request("/")).json()).resolves.toEqual({
      actor: user.id,
      correlationId: "request-1"
    })
  })

  it("omits actor when no user is authenticated", async () => {
    const app = new Hono<{ Variables: ContextVariables }>()

    app.get("/", (c) => {
      c.set("requestId", "request-2")
      c.set("user", null)
      return c.json(requestEventContext(c))
    })

    await expect((await app.request("/")).json()).resolves.toEqual({
      correlationId: "request-2"
    })
  })
})
