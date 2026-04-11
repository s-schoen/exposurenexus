import { Hono } from "hono"
import type { User } from "better-auth"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestApp, createTestUser } from "../test/app.js"

vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn()
    }
  }
}))

import { auth } from "../lib/auth.js"
import { authNAnnotate, authNRequire } from "./auth.js"

interface AuthTestVariables {
  user: User | null
  session: {
    id: string
    createdAt: Date
    updatedAt: Date
    userId: string
    expiresAt: Date
    token: string
    ipAddress?: string | null
    userAgent?: string | null
  } | null
}

describe("auth middleware", () => {
  const user = createTestUser()
  const session = {
    id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    userId: user.id,
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    token: "test-session-token",
    ipAddress: null,
    userAgent: null
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("annotates requests with null user and session when no session exists", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)

    const app = new Hono<{ Variables: AuthTestVariables }>()
    app.use("*", authNAnnotate())
    app.get("/", (c) => {
      return c.json({
        user: c.get("user"),
        session: c.get("session")
      })
    })

    const response = await app.request("/")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(auth.api.getSession).toHaveBeenCalledOnce()
    expect(body).toEqual({
      user: null,
      session: null
    })
  })

  it("annotates requests with the authenticated user and session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user,
      session
    })

    const app = new Hono<{ Variables: AuthTestVariables }>()
    app.use("*", authNAnnotate())
    app.get("/", (c) => {
      return c.json({
        user: c.get("user"),
        session: c.get("session")
      })
    })

    const response = await app.request("/")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      user: {
        ...user,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      session: {
        ...session,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z"
      }
    })
  })

  it("rejects requests without an authenticated user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)

    const protectedAssets = new Hono()
    protectedAssets.get("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: authNAnnotate(),
      requireAuth: authNRequire(),
      assetRoute: protectedAssets
    })

    const response = await app.request("/api/assets", {
      headers: {
        "X-Request-Id": "auth-middleware-unauthorized-request"
      }
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      correlationId: "auth-middleware-unauthorized-request",
      status: 401,
      error: "Unauthorized"
    })
  })

  it("allows requests with an authenticated user", async () => {
    const app = new Hono<{ Variables: AuthTestVariables }>()
    app.use("*", async (c, next) => {
      c.set("user", user)
      c.set("session", session)
      await next()
    })
    app.use("*", authNRequire())
    app.get("/", (c) => c.json({ userId: c.get("user")?.id ?? null }))

    const response = await app.request("/")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      userId: user.id
    })
  })
})
