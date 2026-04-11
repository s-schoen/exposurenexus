import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { pino } from "pino"
import { createApp } from "../app.js"
import health from "../routes/health.js"

interface CreateTestAppOptions {
  annotateAuth?: MiddlewareHandler
  requireAuth?: MiddlewareHandler
  healthRoute?: Hono<any>
  authRoute?: Hono<any>
  assetRoute?: Hono<any>
  vulnerabilityRoute?: Hono<any>
  findingStatsRoute?: Hono<any>
  findingRoute?: Hono<any>
  importerRoute?: Hono<any>
}

const passthrough: MiddlewareHandler = async (_c, next) => {
  await next()
}

export function createTestApp(options: CreateTestAppOptions = {}) {
  const emptyRoute = new Hono()

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
    vulnerabilityRoute: options.vulnerabilityRoute ?? emptyRoute,
    findingStatsRoute: options.findingStatsRoute ?? emptyRoute,
    findingRoute: options.findingRoute ?? emptyRoute,
    importerRoute: options.importerRoute ?? emptyRoute
  })
}
