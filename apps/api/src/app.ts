import { Hono } from "hono"
import { cors } from "hono/cors"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import { registerErrorHandler } from "./lib/handler.js"
import { accessLogger } from "./middleware/logger.js"
import type { ContextVariables } from "./lib/hono-schema.js"

export interface CreateAppOptions {
  logger: Logger
  accessLogger: Logger
  corsOrigin: string
  apiTimeoutMs: number
  annotateAuth: MiddlewareHandler<{ Variables: ContextVariables }>
  csrfProtection: MiddlewareHandler<{ Variables: ContextVariables }>
  requireAuth: MiddlewareHandler<{ Variables: ContextVariables }>
  healthRoute: Hono
  authRoute: Hono<{ Variables: ContextVariables }>
  assetRoute: Hono<{ Variables: ContextVariables }>
  roleRoute: Hono<{ Variables: ContextVariables }>
  userRoute: Hono<{ Variables: ContextVariables }>
  vulnerabilityRoute: Hono<{ Variables: ContextVariables }>
  findingStatsRoute: Hono<{ Variables: ContextVariables }>
  findingRoute: Hono<{ Variables: ContextVariables }>
  importerRoute: Hono<{ Variables: ContextVariables }>
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
      origin: options.corsOrigin,
      allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      allowMethods: ["POST", "GET", "DELETE", "PUT", "PATCH", "OPTIONS"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true
    })
  )
  app.use("*", options.annotateAuth)
  app.use("*", options.csrfProtection)

  registerErrorHandler(app, options.logger)

  app.route("/health", options.healthRoute)
  app.route("/auth", options.authRoute)

  app.use("*", options.requireAuth)

  app.route("/assets", options.assetRoute)
  app.route("/roles", options.roleRoute)
  app.route("/users", options.userRoute)
  app.route("/vulnerabilities", options.vulnerabilityRoute)
  app.route("/findings", options.findingStatsRoute)
  app.route("/findings", options.findingRoute)
  app.route("/findings", options.importerRoute)

  return app
}
