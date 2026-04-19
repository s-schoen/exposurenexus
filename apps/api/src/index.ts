import { serve } from "@hono/node-server"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import { migrateToLatest } from "./db/migration.js"
import { db, logger as dbLogger, pool } from "./db/index.js"
import { createAppContainer } from "./container.js"
import { createAuth } from "./lib/auth.js"

const logger = createLogger("api")
const auditLogger = createLogger("audit/api")

await migrateToLatest(db, dbLogger)

const auth = createAuth({
  pool,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET
})

const container = createAppContainer({
  db,
  auth,
  authUrl: env.AUTH_URL,
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
