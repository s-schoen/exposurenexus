import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import type { UserProfile } from "@exposurenexus/types/model/user"
import { createApp } from "../app.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import health from "../routes/health.js"

interface CreateTestAppOptions {
  staticDir?: string
  annotateAuth?: MiddlewareHandler<{ Variables: ContextVariables }>
  csrfProtection?: MiddlewareHandler<{ Variables: ContextVariables }>
  requireAuth?: MiddlewareHandler<{ Variables: ContextVariables }>
  healthRoute?: Hono
  authRoute?: Hono<{ Variables: ContextVariables }>
  assetRoute?: Hono<{ Variables: ContextVariables }>
  roleRoute?: Hono<{ Variables: ContextVariables }>
  userRoute?: Hono<{ Variables: ContextVariables }>
  vulnerabilityRoute?: Hono<{ Variables: ContextVariables }>
  findingStatsRoute?: Hono<{ Variables: ContextVariables }>
  findingRoute?: Hono<{ Variables: ContextVariables }>
  importerRoute?: Hono<{ Variables: ContextVariables }>
}

const passthrough: MiddlewareHandler<{ Variables: ContextVariables }> = async (
  _c,
  next
) => {
  await next()
}

export function createTestUser(
  overrides: Partial<UserProfile> = {}
): UserProfile {
  return {
    id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    email: "tester@example.com",
    username: "tester",
    displayName: "Test User",
    enabled: true,
    roleIds: [],
    ...overrides
  }
}

export function annotateAuthenticatedUser(
  user: UserProfile
): MiddlewareHandler<{ Variables: ContextVariables }> {
  return async (c, next) => {
    c.set("user", user)
    c.set("session", {
      id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
      sessionId: "test-session-id-digest",
      userId: user.id,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-31T00:00:00.000Z")
    })
    await next()
  }
}

export const requireAuthenticatedUser: MiddlewareHandler<{
  Variables: ContextVariables
}> = async (c, next) => {
  if (!c.get("user")) {
    throw new HTTPException(401, { message: "Unauthorized" })
  }

  await next()
}

export function createTestApp(options: CreateTestAppOptions = {}) {
  const emptyRoute = new Hono<{ Variables: ContextVariables }>()
  const protectedEmptyRoute = new Hono<{ Variables: ContextVariables }>()

  return createApp({
    logger: pino({ enabled: false }),
    accessLogger: pino({ enabled: false }),
    appOrigin: "http://localhost:3000",
    staticDir: options.staticDir,
    apiTimeoutMs: 5000,
    annotateAuth: options.annotateAuth ?? passthrough,
    csrfProtection: options.csrfProtection ?? passthrough,
    requireAuth: options.requireAuth ?? passthrough,
    healthRoute: options.healthRoute ?? health,
    authRoute: options.authRoute ?? emptyRoute,
    assetRoute: options.assetRoute ?? protectedEmptyRoute,
    roleRoute: options.roleRoute ?? protectedEmptyRoute,
    userRoute: options.userRoute ?? protectedEmptyRoute,
    vulnerabilityRoute: options.vulnerabilityRoute ?? protectedEmptyRoute,
    findingStatsRoute: options.findingStatsRoute ?? protectedEmptyRoute,
    findingRoute: options.findingRoute ?? protectedEmptyRoute,
    importerRoute: options.importerRoute ?? protectedEmptyRoute
  })
}
