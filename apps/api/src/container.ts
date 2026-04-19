import type { Kysely } from "kysely"
import type { Logger } from "pino"
import { createApp } from "./app.js"
import type { Database } from "./db/index.js"
import { createDefaultAdmin } from "./lib/auth.js"
import { createLogger } from "./logging.js"
import {
  createAuthAnnotate,
  authNRequire,
  createRequireDomainPermission
} from "./middleware/auth.js"
import {
  createAssetRepository,
  createFindingRepository,
  createRoleRepository,
  createUserRepository,
  createVulnerabilityRepository
} from "./repository/index.js"
import {
  createAssetService,
  createFindingService,
  createRoleService,
  createStatsService,
  createUserService,
  createVulnerabilityService
} from "./service/index.js"
import health from "./routes/health.js"
import { createAuthRoute } from "./routes/auth.js"
import { createAssetRoute } from "./routes/assets.js"
import { createUserRoute } from "./routes/users.js"
import { createVulnerabilityRoute } from "./routes/vulnerabilities.js"
import { createFindingStatsRoute } from "./routes/stats.js"
import { createFindingRoute } from "./routes/findings.js"
import { createImportRoute } from "./routes/import.js"
import { createGetOrCreateAsset } from "./import/util.js"
import { createNucleiFindingParser } from "./import/nuclei.js"
import { createFindingImporter } from "./import/importer.js"
import type { AuthClient } from "./lib/auth.js"

type LoggerFactory = (moduleName: string) => Logger

export interface CreateAppContainerOptions {
  db: Kysely<Database>
  auth: AuthClient
  authUrl: string
  apiTimeoutMs: number
  logger: Logger
  accessLogger: Logger
  dbLogger?: Logger
  loggerFactory?: LoggerFactory
}

export function createAppContainer(options: CreateAppContainerOptions) {
  const loggerFactory = options.loggerFactory ?? createLogger
  const auth = options.auth
  const requireDomainPermission = createRequireDomainPermission(
    auth.api.userHasPermission
  )

  const repositories = {
    assetRepository: createAssetRepository(options.db),
    findingRepository: createFindingRepository(options.db),
    roleRepository: createRoleRepository(options.db),
    userRepository: createUserRepository(options.db),
    vulnerabilityRepository: createVulnerabilityRepository(options.db)
  }

  const assetService = createAssetService({
    assetRepository: repositories.assetRepository,
    logger: loggerFactory("service/asset")
  })
  const roleService = createRoleService({
    roleRepository: repositories.roleRepository,
    logger: loggerFactory("service/role")
  })
  const userService = createUserService({
    userRepository: repositories.userRepository,
    roleService,
    auth,
    logger: loggerFactory("service/user")
  })
  const vulnerabilityService = createVulnerabilityService({
    vulnerabilityRepository: repositories.vulnerabilityRepository,
    logger: loggerFactory("service/vulnerability")
  })
  const findingService = createFindingService({
    findingRepository: repositories.findingRepository,
    vulnerabilityService,
    logger: loggerFactory("service/finding")
  })
  const statsService = createStatsService({
    findingRepository: repositories.findingRepository,
    logger: loggerFactory("service/stats")
  })

  const importLogger = loggerFactory("findings/import")
  const nucleiLogger = loggerFactory("findings/import/nuclei")
  const getOrCreateAsset = createGetOrCreateAsset({
    assetService,
    logger: importLogger
  })
  const nucleiParser = createNucleiFindingParser({
    vulnerabilityService,
    findingService,
    getOrCreateAsset,
    logger: nucleiLogger
  })
  const importer = createFindingImporter({
    nucleiParser,
    logger: importLogger
  })

  const routes = {
    healthRoute: health,
    authRoute: createAuthRoute(auth),
    assetRoute: createAssetRoute(assetService, { requireDomainPermission }),
    userRoute: createUserRoute(userService, { requireDomainPermission }),
    vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService, {
      requireDomainPermission
    }),
    findingStatsRoute: createFindingStatsRoute(statsService, {
      requireDomainPermission
    }),
    findingRoute: createFindingRoute(findingService, {
      requireDomainPermission
    }),
    importerRoute: createImportRoute({
      importer,
      logger: importLogger,
      requireDomainPermission
    })
  }

  const middleware = {
    annotateAuth: createAuthAnnotate(auth.api),
    requireAuth: authNRequire()
  }

  const app = createApp({
    logger: options.logger,
    accessLogger: options.accessLogger,
    authUrl: options.authUrl,
    apiTimeoutMs: options.apiTimeoutMs,
    annotateAuth: middleware.annotateAuth,
    requireAuth: middleware.requireAuth,
    ...routes
  })

  return {
    auth,
    repositories,
    services: {
      assetService,
      roleService,
      userService,
      vulnerabilityService,
      findingService,
      statsService
    },
    importer,
    routes,
    middleware,
    app,
    createDefaultAdmin: () =>
      createDefaultAdmin({
        db: options.db,
        auth,
        logger: options.dbLogger ?? loggerFactory("db")
      })
  }
}
