import { Hono } from "hono"
import { cors } from "hono/cors"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import { registerErrorHandler } from "./lib/handler.js"
import { accessLogger } from "./middleware/logger.js"

export interface CreateAppOptions {
  logger: Logger
  accessLogger: Logger
  authUrl: string
  apiTimeoutMs: number
  annotateAuth: MiddlewareHandler
  requireAuth: MiddlewareHandler
  healthRoute: Hono<any>
  authRoute: Hono<any>
  assetRoute: Hono<any>
  vulnerabilityRoute: Hono<any>
  findingStatsRoute: Hono<any>
  findingRoute: Hono<any>
  importerRoute: Hono<any>
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono().basePath("/api")

  app.use("*", requestId())
  app.use(accessLogger(options.accessLogger))
  app.use(secureHeaders())
  app.use("/api", timeout(options.apiTimeoutMs))
  app.use(
    "*",
    cors({
      origin: options.authUrl,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "GET", "DELETE", "PUT", "PATCH", "OPTIONS"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true
    })
  )
  app.use("*", options.annotateAuth)

  registerErrorHandler(app, options.logger)

  app.route("/health", options.healthRoute)
  app.route("/auth", options.authRoute)

  app.use("*", options.requireAuth)

  app.route("/assets", options.assetRoute)
  app.route("/vulnerabilities", options.vulnerabilityRoute)
  app.route("/findings", options.findingStatsRoute)
  app.route("/findings", options.findingRoute)
  app.route("/findings", options.importerRoute)

  return app
}
