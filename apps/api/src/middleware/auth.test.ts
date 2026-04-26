import { Hono } from "hono"
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"
import {
  type Permission,
  PermissionResource,
  PermissionVerb
} from "@openvlp/types/model/rbac"
import type { ContextVariables } from "../lib/hono-schema.js"
import { createTestApp, createTestUser } from "../test/app.js"
import { type ResourcePermissionVerbAssignment } from "../lib/permissions.js"
import {
  authNRequire,
  createAuthAnnotate,
  createRequireDomainPermission,
  createRequirePermission
} from "./auth.js"

type TestSession = {
  id: string
  createdAt: Date
  updatedAt: Date
  userId: string
  expiresAt: Date
  token: string
  ipAddress?: string | null
  userAgent?: string | null
}

describe("auth middleware", () => {
  type PermissionChecker = Parameters<typeof createRequirePermission>[0]

  const invalidPermissionChecker: PermissionChecker =
    // @ts-expect-error permission checks must resolve to boolean only
    async () => ({ success: true })

  void invalidPermissionChecker

  const user = createTestUser()
  const session: TestSession = {
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

  it("uses narrowed permission boundary types", () => {
    type MiddlewarePermissionPayload = Parameters<
      typeof createRequirePermission
    >[1]
    type InvalidPermissionVerb = {
      resource: PermissionResource.Asset
      verb: "list"
    } extends MiddlewarePermissionPayload
      ? true
      : false
    type BogusResource = {
      resource: "bogus"
      verb: PermissionVerb.Read
    } extends MiddlewarePermissionPayload
      ? true
      : false

    expectTypeOf<MiddlewarePermissionPayload>().toEqualTypeOf<
      Permission | Permission[]
    >()
    expectTypeOf<Parameters<PermissionChecker>[0]>().toEqualTypeOf<string>()
    expectTypeOf<
      Parameters<PermissionChecker>[1]
    >().toEqualTypeOf<ResourcePermissionVerbAssignment>()
    expectTypeOf<InvalidPermissionVerb>().toEqualTypeOf<false>()
    expectTypeOf<BogusResource>().toEqualTypeOf<false>()
    expectTypeOf<ReturnType<PermissionChecker>>().toEqualTypeOf<
      Promise<boolean>
    >()
  })

  it("annotates requests with null user and session when no session exists", async () => {
    const getSession = vi.fn().mockResolvedValue(null)

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", createAuthAnnotate({ getSession }))
    app.get("/", (c) => {
      return c.json({
        user: c.get("user"),
        session: c.get("session")
      })
    })

    const response = await app.request("/")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(getSession).toHaveBeenCalledOnce()
    expect(body).toEqual({
      user: null,
      session: null
    })
  })

  it("annotates requests with the authenticated user and session", async () => {
    const getSession = vi.fn().mockResolvedValue({
      user,
      session
    })

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", createAuthAnnotate({ getSession }))
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

  it("supports an injected auth instance for session annotation", async () => {
    const getSession = vi.fn().mockResolvedValue({
      user,
      session
    })

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", createAuthAnnotate({ getSession }))
    app.get("/", (c) => {
      const currentSession = c.get("session") as TestSession | null

      return c.json({
        userId: c.get("user")?.id ?? null,
        sessionId: currentSession?.id ?? null
      })
    })

    const response = await app.request("/")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(getSession).toHaveBeenCalledOnce()
    expect(body).toEqual({
      userId: user.id,
      sessionId: session.id
    })
  })

  it("rejects requests without an authenticated user", async () => {
    const getSession = vi.fn().mockResolvedValue(null)

    const protectedAssets = new Hono<{ Variables: ContextVariables }>()
    protectedAssets.get("/", (c) => c.json({ ok: true }))

    const app = createTestApp({
      annotateAuth: createAuthAnnotate({ getSession }),
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
    const app = new Hono<{ Variables: ContextVariables }>()
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

  it("returns 403 when the authenticated user lacks the required permission", async () => {
    const viewer = createTestUser({ role: "viewer" })
    const userHasPermission = vi.fn().mockResolvedValue(false)

    const protectedRoute = new Hono<{ Variables: ContextVariables }>()
    protectedRoute.get(
      "/",
      createRequirePermission(userHasPermission, {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Delete
      }),
      (c) => c.json({ ok: true })
    )

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", async (c, next) => {
      c.set("user", viewer)
      c.set("session", session)
      await next()
    })
    app.route("/assets", protectedRoute)

    const response = await app.request("/assets")

    expect(response.status).toBe(403)
  })

  it("allows requests when the permission result is true", async () => {
    const userHasPermission = vi.fn().mockResolvedValue(true)

    const protectedRoute = new Hono<{ Variables: ContextVariables }>()
    protectedRoute.get(
      "/",
      createRequirePermission(userHasPermission, {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      }),
      (c) => c.json({ ok: true })
    )

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", async (c, next) => {
      c.set("user", user)
      c.set("session", session)
      await next()
    })
    app.route("/assets", protectedRoute)

    const response = await app.request("/assets")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it("creates a domain-permission middleware factory from an injected checker", async () => {
    const userHasPermission = vi.fn().mockResolvedValue(true)
    const requireDomainPermission =
      createRequireDomainPermission(userHasPermission)

    const protectedRoute = new Hono<{ Variables: ContextVariables }>()
    protectedRoute.get(
      "/",
      requireDomainPermission(PermissionResource.Asset, PermissionVerb.Delete),
      (c) => c.json({ ok: true })
    )

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", async (c, next) => {
      c.set("user", user)
      c.set("session", session)
      await next()
    })
    app.route("/assets", protectedRoute)

    const response = await app.request("/assets")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      [PermissionResource.Asset]: [PermissionVerb.Delete]
    })
  })

  it("allows a comma-separated multi-role user through the permission middleware path", async () => {
    const multiRoleUser = createTestUser({ role: "viewer,editor" })
    const userHasPermission = vi.fn().mockResolvedValue(true)

    const protectedRoute = new Hono<{ Variables: ContextVariables }>()
    protectedRoute.get(
      "/",
      createRequirePermission(userHasPermission, {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      }),
      (c) => c.json({ ok: true, role: c.get("user")?.role ?? null })
    )

    const app = new Hono<{ Variables: ContextVariables }>()
    app.use("*", async (c, next) => {
      c.set("user", multiRoleUser)
      c.set("session", session)
      await next()
    })
    app.route("/assets", protectedRoute)

    const response = await app.request("/assets")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, role: "viewer,editor" })
    expect(userHasPermission).toHaveBeenCalledWith(multiRoleUser.id, {
      [PermissionResource.Asset]: [PermissionVerb.Read]
    })
  })
})
