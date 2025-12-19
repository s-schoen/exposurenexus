import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import health from "./routes/health.js"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import { timeout } from "hono/timeout"
import { accessLogger } from "./middleware/logger.js"

const logger = createLogger("main")

const app = new Hono().basePath("/api")

// setup middleware
app.use("*", requestId())
app.use(accessLogger())
app.use(secureHeaders())
app.use("/api", timeout(env.API_TIMEOUT_MS))

// setup routes
app.route("/health", health)

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    logger.info(`server is running on localhost:${info.port}`)
  }
)
