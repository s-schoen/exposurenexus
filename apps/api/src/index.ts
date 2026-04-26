import { serve } from "@hono/node-server"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import { migrateToLatest } from "./db/migration.js"
import { db, logger as dbLogger, pool } from "./db/index.js"
import { createAppContainer } from "./container.js"
import { createAuth } from "./lib/auth.js"
import { BuiltInRoleName } from "@openvlp/types/model/rbac"

const logger = createLogger("api")
const auditLogger = createLogger("audit/api")

await migrateToLatest(db, dbLogger)

const auth = createAuth({
  pool,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET,
  defaultRole: BuiltInRoleName.Viewer,
  adminRoles: [BuiltInRoleName.Admin]
})

const container = createAppContainer({
  db,
  auth,
  authUrl: env.AUTH_URL,
  authSessionLifetimeHours: env.AUTH_SESSION_LIFETIME,
  authSessionHmacSecret: env.AUTH_SECRET,
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
