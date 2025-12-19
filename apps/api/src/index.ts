import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import health from "./routes/health.js"
import { requestId } from "hono/request-id"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import { accessLogger } from "./middleware/logger.js"
import { registerErrorHandler } from "./lib/handler.js"
import { migrateToLatest } from "./db/migration.js"
import auth from "./routes/auth.js"
import { authNAnnotate, authNRequire } from "./middleware/auth.js"
import { createDefaultAdmin } from "./lib/auth.js"

// apply database migrations
await migrateToLatest()
await createDefaultAdmin()

const logger = createLogger("api")
const app = new Hono().basePath("/api")

// setup middleware
app.use("*", requestId())
app.use(accessLogger())
app.use(secureHeaders())
app.use("/api", timeout(env.API_TIMEOUT_MS))
app.use(
  "/api/auth/*",
  cors({
    origin: env.AUTH_URL,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true
  })
)
app.use("*", authNAnnotate())

// setup handlers
registerErrorHandler(app, logger)

// setup public routes
app.route("/health", health)
app.route("/auth", auth)

// setup protected routes
app.use("*", authNRequire())

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    logger.info(`server is running on localhost:${info.port}`)
  }
)
