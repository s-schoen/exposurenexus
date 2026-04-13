import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import type { User } from "better-auth"
import { createApp } from "../app.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import health from "../routes/health.js"

interface CreateTestAppOptions {
  annotateAuth?: MiddlewareHandler
  requireAuth?: MiddlewareHandler
  healthRoute?: Hono
  authRoute?: Hono
  assetRoute?: Hono
  userRoute?: Hono
  vulnerabilityRoute?: Hono
  findingStatsRoute?: Hono
  findingRoute?: Hono<{ Variables: ContextVariables }>
  importerRoute?: Hono<{ Variables: ContextVariables }>
}

const passthrough: MiddlewareHandler = async (_c, next) => {
  await next()
}

export function createTestUser(overrides: Partial<User> = {}): User {
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
    ...overrides
  } as User
}

export function annotateAuthenticatedUser(user: User): MiddlewareHandler {
  return async (c, next) => {
    c.set("user", user)
    c.set("session", { userId: user.id })
    await next()
  }
}

export const requireAuthenticatedUser: MiddlewareHandler = async (c, next) => {
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
    assetRoute: options.assetRoute ?? emptyRoute,
    userRoute: options.userRoute ?? emptyRoute,
    vulnerabilityRoute: options.vulnerabilityRoute ?? emptyRoute,
    findingStatsRoute: options.findingStatsRoute ?? emptyRoute,
    findingRoute: options.findingRoute ?? protectedEmptyRoute,
    importerRoute: options.importerRoute ?? protectedEmptyRoute
  })
}
