import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import type { Context, MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import { registerErrorHandler } from "./lib/handler.js"
import { accessLogger } from "./middleware/logger.js"
import type { ContextVariables } from "./lib/hono-schema.js"
import { replyError, routeNotFound } from "./lib/api-error.js"

export interface CreateAppOptions {
  logger: Logger
  accessLogger: Logger
  appOrigin: string
  staticDir?: string
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

function registerStaticRoutes(
  app: Hono<{ Variables: ContextVariables }>,
  staticDir?: string
) {
  if (!staticDir) {
    return
  }

  const staticAssets = serveStatic<{ Variables: ContextVariables }>({
    root: staticDir
  })
  const spaFallback = serveStatic<{ Variables: ContextVariables }>({
    root: staticDir,
    path: "index.html"
  })

  app.get("*", staticAssets)
  app.on("HEAD", "*", staticAssets)
  app.get("*", spaFallback)
  app.on("HEAD", "*", spaFallback)
}

function apiNotFound(c: Context<{ Variables: ContextVariables }>) {
  return replyError(c, routeNotFound())
}

function createApiApp(options: CreateAppOptions) {
  const api = new Hono<{ Variables: ContextVariables }>()

  api.use("*", timeout(options.apiTimeoutMs))
  api.use(
    "*",
    cors({
      origin: options.appOrigin,
      allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      allowMethods: ["POST", "GET", "DELETE", "PUT", "PATCH", "OPTIONS"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true
    })
  )
  api.use("*", options.annotateAuth)
  api.use("*", options.csrfProtection)

  registerErrorHandler(api, options.logger)

  api.route("/health", options.healthRoute)
  api.route("/auth", options.authRoute)

  api.use("*", options.requireAuth)

  api.route("/assets", options.assetRoute)
  api.route("/roles", options.roleRoute)
  api.route("/users", options.userRoute)
  api.route("/vulnerabilities", options.vulnerabilityRoute)
  api.route("/findings", options.findingStatsRoute)
  api.route("/findings", options.findingRoute)
  api.route("/findings", options.importerRoute)

  api.all("*", apiNotFound)
  api.notFound(apiNotFound)

  return api
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono<{ Variables: ContextVariables }>()

  app.use("*", requestId())
  app.use("*", accessLogger(options.accessLogger))
  app.use("*", secureHeaders())

  registerErrorHandler(app, options.logger)

  app.route("/api", createApiApp(options))
  app.all("/api", apiNotFound)
  app.all("/api/*", apiNotFound)
  registerStaticRoutes(app, options.staticDir)

  return app
}
