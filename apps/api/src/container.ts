import type { Kysely } from "kysely"
import type { Logger } from "pino"
import { createApp } from "./app.js"
import type { Database } from "./db/index.js"
import { createDefaultAdmin } from "./lib/default-admin.js"
import { createLogger } from "./logging.js"
import {
  createAuthAnnotate,
  authNRequire,
  createRequireDomainPermission,
  createAuthCookiePolicy
} from "./middleware/auth.js"
import { createCsrfProtection } from "./middleware/csrf.js"
import {
  createAssetRepository,
  createFindingRepository,
  createRoleRepository,
  createUserProfileRepository,
  createUserRoleRepository,
  createUserSessionRepository,
  createVulnerabilityRepository
} from "./repository/index.js"
import {
  createAuthService,
  createAssetService,
  createFindingService,
  createRoleService,
  createStatsService,
  createUserProfileService,
  createVulnerabilityService
} from "./service/index.js"
import health from "./routes/health.js"
import { createAuthRoute } from "./routes/auth.js"
import { createAssetRoute } from "./routes/assets.js"
import { createRoleRoute } from "./routes/roles.js"
import { createUserRoute } from "./routes/users.js"
import { createVulnerabilityRoute } from "./routes/vulnerabilities.js"
import { createFindingStatsRoute } from "./routes/stats.js"
import { createFindingRoute } from "./routes/findings.js"
import { createImportRoute } from "./routes/import.js"
import { createGetOrCreateAsset } from "./import/util.js"
import { createNucleiFindingParser } from "./import/nuclei.js"
import { createFindingImporter } from "./import/importer.js"
import { EventBus } from "./lib/eventbus/eventbus.js"
import type { DomainEvent } from "./lib/eventbus/events/index.js"
import { registerEventHandlers } from "./event-handler/index.js"

type LoggerFactory = (moduleName: string) => Logger

export interface CreateAppContainerOptions {
  db: Kysely<Database>
  corsOrigin: string
  authSessionLifetimeHours: number
  authSessionHmacSecret: string
  authCookieSecure: boolean
  authTrustedProxies: readonly string[]
  apiTimeoutMs: number
  logger: Logger
  accessLogger: Logger
  dbLogger?: Logger
  loggerFactory?: LoggerFactory
}

export function createAppContainer(options: CreateAppContainerOptions) {
  const loggerFactory = options.loggerFactory ?? createLogger
  const authCookiePolicy = createAuthCookiePolicy({
    secure: options.authCookieSecure
  })

  // setup event bus
  const eventBus = new EventBus<DomainEvent>()
  registerEventHandlers({ eventBus, loggerFactory })

  const repositories = {
    assetRepository: createAssetRepository(options.db),
    findingRepository: createFindingRepository(options.db),
    roleRepository: createRoleRepository(options.db),
    userRoleRepository: createUserRoleRepository(options.db),
    userProfileRepository: createUserProfileRepository(options.db),
    userSessionRepository: createUserSessionRepository(options.db),
    vulnerabilityRepository: createVulnerabilityRepository(options.db)
  }

  const authService = createAuthService({
    userProfileRepository: repositories.userProfileRepository,
    userSessionRepository: repositories.userSessionRepository,
    userRoleRepository: repositories.userRoleRepository,
    domainEventEmitter: eventBus,
    sessionLifetimeHours: options.authSessionLifetimeHours,
    sessionHmacSecret: options.authSessionHmacSecret,
    logger: loggerFactory("service/auth")
  })
  const requireDomainPermission = createRequireDomainPermission(
    authService.userHasPermission
  )
  const roleService = createRoleService({
    roleRepository: repositories.roleRepository,
    logger: loggerFactory("service/role")
  })
  const userProfileService = createUserProfileService({
    userProfileRepository: repositories.userProfileRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/user-profile")
  })
  const assetService = createAssetService({
    assetRepository: repositories.assetRepository,
    userProfileService,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/asset")
  })
  const vulnerabilityService = createVulnerabilityService({
    vulnerabilityRepository: repositories.vulnerabilityRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/vulnerability")
  })
  const findingService = createFindingService({
    findingRepository: repositories.findingRepository,
    userProfileService,
    vulnerabilityService,
    domainEventEmitter: eventBus,
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

  const csrfProtection = createCsrfProtection({
    allowedOrigins: [options.corsOrigin],
    tokenSecret: options.authSessionHmacSecret,
    cookiePolicy: authCookiePolicy
  })

  const routes = {
    healthRoute: health,
    authRoute: createAuthRoute(authService, {
      csrf: csrfProtection,
      cookiePolicy: authCookiePolicy,
      trustedProxies: options.authTrustedProxies
    }),
    assetRoute: createAssetRoute(assetService, { requireDomainPermission }),
    roleRoute: createRoleRoute(roleService, { requireDomainPermission }),
    userRoute: createUserRoute(userProfileService, { requireDomainPermission }),
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
    annotateAuth: createAuthAnnotate(authService, authCookiePolicy),
    csrfProtection: csrfProtection.middleware,
    requireAuth: authNRequire()
  }

  const app = createApp({
    logger: options.logger,
    accessLogger: options.accessLogger,
    corsOrigin: options.corsOrigin,
    apiTimeoutMs: options.apiTimeoutMs,
    annotateAuth: middleware.annotateAuth,
    csrfProtection: middleware.csrfProtection,
    requireAuth: middleware.requireAuth,
    ...routes
  })

  return {
    repositories,
    services: {
      authService,
      assetService,
      roleService,
      userProfileService,
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
        logger: options.dbLogger ?? loggerFactory("db")
      })
  }
}
