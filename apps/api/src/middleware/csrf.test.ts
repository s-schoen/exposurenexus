import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ContextVariables } from "../lib/hono-schema.js"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { AUTH_SESSION_COOKIE } from "./auth.js"
import { CSRF_COOKIE, CSRF_HEADER, createCsrfProtection } from "./csrf.js"
import { createAuthRoute } from "../routes/auth.js"

describe("csrf protection", () => {
  const trustedOrigin = "http://localhost:3000"
  const tokenSecret =
    "012345678901234567890123456789012345678901234567890123456789"
  const user = createTestUser()
  const session = {
    id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
    sessionId: "stored-session-id-digest",
    userId: user.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-04-26T08:00:00.000Z"),
    expiresAt: new Date("2026-04-26T20:00:00.000Z")
  }
  const authService = {
    createSessionForCredentials: vi.fn(),
    createSession: vi.fn(),
    validateSession: vi.fn(),
    revokeSession: vi.fn(),
    userHasPermission: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createCsrf() {
    return createCsrfProtection({
      allowedOrigins: [trustedOrigin],
      tokenSecret
    })
  }

  function csrfCookie(token: string) {
    return `${CSRF_COOKIE}=${token}`
  }

  function sessionCookie(sessionId: string) {
    return `${AUTH_SESSION_COOKIE}=${sessionId}`
  }

  async function issueCsrfToken() {
    const csrf = createCsrf()
    const tokenApp = new Hono<{ Variables: ContextVariables }>()

    tokenApp.use("*", annotateAuthenticatedUser(user))
    tokenApp.get("/", (c) => {
      const currentSession = c.get("session")
      if (!currentSession) {
        throw new Error("expected authenticated test session")
      }

      csrf.issueToken(c, currentSession)
      return c.json({ ok: true })
    })

    const response = await tokenApp.request("/")
    const setCookie = response.headers.get("set-cookie") ?? ""
    const token = setCookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`))?.[1]

    if (!token) {
      throw new Error("failed to issue csrf token")
    }

    return token
  }

  it("issues csrf tokens as readable secure __Host cookies", async () => {
    const csrf = createCsrf()
    const tokenApp = new Hono<{ Variables: ContextVariables }>()

    tokenApp.use("*", annotateAuthenticatedUser(user))
    tokenApp.get("/", (c) => {
      const currentSession = c.get("session")
      if (!currentSession) {
        throw new Error("expected authenticated test session")
      }

      csrf.issueToken(c, currentSession)
      return c.json({ ok: true })
    })

    const response = await tokenApp.request("/")
    const setCookie = response.headers.get("set-cookie") ?? ""

    expect(setCookie).toContain(`${CSRF_COOKIE}=`)
    expect(setCookie).toContain("Secure")
    expect(setCookie).toContain("Path=/")
    expect(setCookie).not.toContain("HttpOnly")
    expect(setCookie).not.toContain("Domain=")
  })

  it("allows safe methods without csrf request headers", async () => {
    const csrf = createCsrf()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.get("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true
    })
  })

  it("rejects cross-site unsafe requests using fetch metadata", async () => {
    const csrf = createCsrf()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        origin: trustedOrigin,
        "sec-fetch-site": "cross-site",
        "X-Request-Id": "csrf-cross-site-request"
      }
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      correlationId: "csrf-cross-site-request",
      status: 403,
      error: "Forbidden"
    })
  })

  it("rejects unsafe requests without a trusted origin", async () => {
    const csrf = createCsrf()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        "X-Request-Id": "csrf-missing-origin-request"
      }
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      correlationId: "csrf-missing-origin-request",
      status: 403,
      error: "Forbidden"
    })
  })

  it("allows login from a trusted origin without a csrf token and issues one", async () => {
    const csrf = createCsrf()
    authService.createSessionForCredentials.mockResolvedValue({
      sessionId: "public-session-token",
      session,
      user
    })

    const app = createTestApp({
      csrfProtection: csrf.middleware,
      authRoute: createAuthRoute(authService, { csrf })
    })

    const response = await app.request("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: trustedOrigin
      },
      body: JSON.stringify({
        username: "alice",
        password: "correct-horse-battery-staple"
      })
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toContain(
      sessionCookie("public-session-token")
    )
    expect(response.headers.get("set-cookie")).toContain(`${CSRF_COOKIE}=`)
  })

  it("rejects authenticated unsafe requests without a csrf token", async () => {
    const csrf = createCsrf()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        origin: trustedOrigin,
        cookie: sessionCookie("public-session-token"),
        "X-Request-Id": "csrf-missing-token-request"
      }
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      correlationId: "csrf-missing-token-request",
      status: 403,
      error: "Forbidden"
    })
  })

  it("rejects authenticated unsafe requests with a mismatched csrf token", async () => {
    const csrf = createCsrf()
    const token = await issueCsrfToken()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        origin: trustedOrigin,
        cookie: `${sessionCookie("public-session-token")}; ${csrfCookie(token)}`,
        [CSRF_HEADER]: "wrong-token",
        "X-Request-Id": "csrf-mismatch-token-request"
      }
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      correlationId: "csrf-mismatch-token-request",
      status: 403,
      error: "Forbidden"
    })
  })

  it("allows authenticated unsafe requests with a valid csrf token", async () => {
    const csrf = createCsrf()
    const token = await issueCsrfToken()
    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      assetRoute: assets
    })

    const response = await app.request("/api/assets", {
      method: "POST",
      headers: {
        origin: trustedOrigin,
        cookie: `${sessionCookie("public-session-token")}; ${csrfCookie(token)}`,
        [CSRF_HEADER]: token
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true
    })
  })

  it("does not rotate csrf token on session reads", async () => {
    const csrf = createCsrf()
    const token = await issueCsrfToken()
    authService.validateSession.mockResolvedValue({
      session,
      user
    })

    const assets = new Hono<{ Variables: ContextVariables }>()
    assets.post("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      requireAuth: requireAuthenticatedUser,
      authRoute: createAuthRoute(authService, { csrf }),
      assetRoute: assets
    })

    const sessionResponse = await app.request("/api/auth/session", {
      headers: {
        cookie: `${sessionCookie("public-session-token")}; ${csrfCookie(token)}`
      }
    })

    expect(sessionResponse.status).toBe(200)
    expect(sessionResponse.headers.get("set-cookie")).toBeNull()

    const unsafeResponse = await app.request("/api/assets", {
      method: "POST",
      headers: {
        origin: trustedOrigin,
        cookie: `${sessionCookie("public-session-token")}; ${csrfCookie(token)}`,
        [CSRF_HEADER]: token
      }
    })
    const body = await unsafeResponse.json()

    expect(unsafeResponse.status).toBe(200)
    expect(body).toEqual({
      ok: true
    })
  })

  it("clears csrf cookie on logout", async () => {
    const csrf = createCsrf()
    const token = await issueCsrfToken()
    authService.revokeSession.mockResolvedValue(true)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      csrfProtection: csrf.middleware,
      authRoute: createAuthRoute(authService, { csrf })
    })

    const response = await app.request("/api/auth", {
      method: "DELETE",
      headers: {
        origin: trustedOrigin,
        cookie: `${sessionCookie("public-session-token")}; ${csrfCookie(token)}`,
        [CSRF_HEADER]: token
      }
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toContain(sessionCookie(""))
    expect(response.headers.get("set-cookie")).toContain(csrfCookie(""))
  })
})
