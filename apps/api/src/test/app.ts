import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import { createApp } from "../app.js"
import type { AuthenticatedUser, ContextVariables } from "../lib/hono-schema.js"
import health from "../routes/health.js"

interface CreateTestAppOptions {
  annotateAuth?: MiddlewareHandler<{ Variables: ContextVariables }>
  requireAuth?: MiddlewareHandler<{ Variables: ContextVariables }>
  healthRoute?: Hono
  authRoute?: Hono
  assetRoute?: Hono<{ Variables: ContextVariables }>
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
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser {
  return {
    id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    email: "tester@example.com",
    name: "Test User",
    emailVerified: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    image: null,
    username: "tester",
    displayUsername: "Tester",
    role: "viewer",
    ...overrides
  } as AuthenticatedUser
}

export function annotateAuthenticatedUser(
  user: AuthenticatedUser
): MiddlewareHandler<{ Variables: ContextVariables }> {
  return async (c, next) => {
    c.set("user", user)
    c.set("session", { userId: user.id })
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
  const emptyRoute = new Hono()
  const protectedEmptyRoute = new Hono<{ Variables: ContextVariables }>()

  return createApp({
    logger: pino({ enabled: false }),
    accessLogger: pino({ enabled: false }),
    authUrl: "http://localhost:3000",
    apiTimeoutMs: 5000,
    annotateAuth: options.annotateAuth ?? passthrough,
    requireAuth: options.requireAuth ?? passthrough,
    healthRoute: options.healthRoute ?? health,
    authRoute: options.authRoute ?? emptyRoute,
    assetRoute: options.assetRoute ?? protectedEmptyRoute,
    userRoute: options.userRoute ?? protectedEmptyRoute,
    vulnerabilityRoute: options.vulnerabilityRoute ?? protectedEmptyRoute,
    findingStatsRoute: options.findingStatsRoute ?? protectedEmptyRoute,
    findingRoute: options.findingRoute ?? protectedEmptyRoute,
    importerRoute: options.importerRoute ?? protectedEmptyRoute
  })
}
