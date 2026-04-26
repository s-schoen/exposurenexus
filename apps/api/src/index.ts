import { serve } from "@hono/node-server"
import { env } from "./env.js"
import { createLogger } from "./logging.js"
import { migrateToLatest } from "./db/migration.js"
import { db, logger as dbLogger, pool } from "./db/index.js"
import { createAppContainer } from "./container.js"
import {
  createAuth,
  createReloadableAuth,
  reloadAuthFromRoles
} from "./lib/auth.js"
import { BuiltInRoleName } from "@openvlp/types/model/rbac"
import { createRoleRepository } from "./repository/index.js"
import { buildBetterAuthRoleConfig } from "./lib/permissions.js"

const logger = createLogger("api")
const auditLogger = createLogger("audit/api")

await migrateToLatest(db, dbLogger)

const roleRepository = createRoleRepository(db)
const runtimeRoles = await roleRepository.list()
const authRoleConfig = buildBetterAuthRoleConfig(runtimeRoles)

const auth = createReloadableAuth(
  createAuth({
    pool,
    authUrl: env.AUTH_URL,
    authSecret: env.AUTH_SECRET,
    roles: authRoleConfig.roles,
    defaultRole: BuiltInRoleName.Viewer
  })
)

const onRolesChanged = async () => {
  await reloadAuthFromRoles({
    auth,
    listRoles: () => roleRepository.list(),
    pool,
    authUrl: env.AUTH_URL,
    authSecret: env.AUTH_SECRET,
    defaultRole: BuiltInRoleName.Viewer
  })
}

const container = createAppContainer({
  db,
  auth,
  onRolesChanged,
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
