import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import health from "./routes/health.js"
import { migrateToLatest } from "./db/migration.js"
import auth from "./routes/auth.js"
import asset from "./routes/assets.js"
import vulnerability from "./routes/vulnerabilities.js"
import { authNAnnotate, authNRequire } from "./middleware/auth.js"
import { createDefaultAdmin } from "./lib/auth.js"
import finding from "./routes/findings.js"
import importer from "./routes/import.js"
import { findingStats } from "./routes/stats.js"

// apply database migrations
await migrateToLatest()
await createDefaultAdmin()

const logger = createLogger("api")
const auditLogger = createLogger("audit/api")
const app = createApp({
  logger,
  accessLogger: auditLogger,
  authUrl: env.AUTH_URL,
  apiTimeoutMs: env.API_TIMEOUT_MS,
  annotateAuth: authNAnnotate(),
  requireAuth: authNRequire(),
  healthRoute: health,
  authRoute: auth,
  assetRoute: asset,
  vulnerabilityRoute: vulnerability,
  findingStatsRoute: findingStats,
  findingRoute: finding,
  importerRoute: importer
})

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    logger.info(`server is running on localhost:${info.port}`)
  }
)
