import type { Kysely } from "kysely"
import type { Pool } from "pg"
import type { Logger } from "pino"
import { createApp } from "./app.js"
import type { Database } from "./db/index.js"
import { createDefaultAdmin, createAuth } from "./lib/auth.js"
import { createLogger } from "./logging.js"
import { createAuthAnnotate, authNRequire } from "./middleware/auth.js"
import {
  createAssetRepository,
  createFindingRepository,
  createUserRepository,
  createVulnerabilityRepository
} from "./repository/index.js"
import {
  createAssetService,
  createFindingService,
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

type LoggerFactory = (moduleName: string) => Logger

export interface CreateAppContainerOptions {
  db: Kysely<Database>
  pool: Pool
  authUrl: string
  authSecret: string
  apiTimeoutMs: number
  logger: Logger
  accessLogger: Logger
  dbLogger?: Logger
  loggerFactory?: LoggerFactory
}

export function createAppContainer(options: CreateAppContainerOptions) {
  const loggerFactory = options.loggerFactory ?? createLogger

  const auth = createAuth({
    pool: options.pool,
    authUrl: options.authUrl,
    authSecret: options.authSecret
  })

  const repositories = {
    assetRepository: createAssetRepository(options.db),
    findingRepository: createFindingRepository(options.db),
    userRepository: createUserRepository(options.db),
    vulnerabilityRepository: createVulnerabilityRepository(options.db)
  }

  const assetService = createAssetService({
    assetRepository: repositories.assetRepository,
    logger: loggerFactory("service/asset")
  })
  const userService = createUserService({
    userRepository: repositories.userRepository,
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
    assetRoute: createAssetRoute(assetService),
    userRoute: createUserRoute(userService),
    vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService),
    findingStatsRoute: createFindingStatsRoute(statsService),
    findingRoute: createFindingRoute(findingService),
    importerRoute: createImportRoute({
      importer,
      logger: importLogger
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
