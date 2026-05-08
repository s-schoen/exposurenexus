import { serve } from "@hono/node-server"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import { migrateToLatest } from "./db/migration.js"
import { db, logger as dbLogger } from "./db/index.js"
import { createAppContainer } from "./container.js"

const logger = createLogger("api")
const auditLogger = createLogger("audit/api")

await migrateToLatest(db, dbLogger)

const container = createAppContainer({
  db,
  appOrigin: env.APP_ORIGIN,
  staticDir: env.STATIC_DIR,
  authSessionLifetimeHours: env.AUTH_SESSION_LIFETIME,
  authSessionHmacSecret: env.AUTH_SECRET,
  authCookieSecure: env.AUTH_COOKIE_SECURE,
  authTrustedProxies: env.AUTH_TRUSTED_PROXIES,
  apiTimeoutMs: env.API_TIMEOUT_MS,
  logger,
  accessLogger: auditLogger,
  dbLogger
})

await container.createDefaultAdmin()

serve(
  {
    fetch: container.app.fetch,
    port: env.PORT
  },
  (info) => {
    logger.info(`server is running on localhost:${info.port}`)
  }
)
