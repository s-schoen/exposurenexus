import { createApp } from "./app.js";
import { registerEventHandlers } from "./event-handler/index.js";
import { createDefaultAdmin } from "./lib/default-admin.js";
import { EventBus } from "./lib/eventbus/eventbus.js";
import { createLogger } from "./logging.js";
import {
  createAuthAnnotate,
  authNRequire,
  createRequireDomainPermission,
  createAuthCookiePolicy,
} from "./middleware/auth.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import {
  createAssetCustomFieldRepository,
  createAssetRepository,
  createFindingPersistenceRepository,
  createFindingVulnerabilityRepository,
  createObservationRepository,
  createRoleRepository,
  createUserProfileRepository,
  createUserRoleRepository,
  createUserSessionRepository,
  createVulnerabilityPersistenceRepository,
} from "./repository/index.js";
import { createAssetRoute } from "./routes/assets.js";
import { createAuthRoute } from "./routes/auth.js";
import { createFindingRoute } from "./routes/findings.js";
import health from "./routes/health.js";
import { createImportRoute } from "./routes/import.js";
import { createRoleRoute } from "./routes/roles.js";
import { createFindingStatsRoute } from "./routes/stats.js";
import { createUserRoute } from "./routes/users.js";
import { createVulnerabilityRoute } from "./routes/vulnerabilities.js";
import {
  createAssetCustomFieldService,
  createAuthService,
  createAssetService,
  createFindingService,
  createRoleService,
  createStatsService,
  createUserProfileService,
  createVulnerabilityService,
} from "./service/index.js";

import type { Database } from "./db/index.js";
import type { DomainEvent } from "./lib/eventbus/events/index.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

type LoggerFactory = (moduleName: string) => Logger;

export interface CreateAppContainerOptions {
  db: Kysely<Database>;
  appOrigin: string;
  staticDir?: string;
  authSessionLifetimeHours: number;
  authSessionHmacSecret: string;
  authCookieSecure: boolean;
  authTrustedProxies: readonly string[];
  apiTimeoutMs: number;
  logger: Logger;
  accessLogger: Logger;
  dbLogger?: Logger;
  loggerFactory?: LoggerFactory;
}

export function createAppContainer(options: CreateAppContainerOptions) {
  const loggerFactory = options.loggerFactory ?? createLogger;
  const authCookiePolicy = createAuthCookiePolicy({
    secure: options.authCookieSecure,
  });

  // setup event bus
  const eventBus = new EventBus<DomainEvent>();
  registerEventHandlers({ eventBus, loggerFactory });

  const repositories = {
    assetCustomFieldRepository: createAssetCustomFieldRepository(options.db),
    assetRepository: createAssetRepository(options.db),
    findingPersistenceRepository: createFindingPersistenceRepository(options.db),
    findingVulnerabilityRepository: createFindingVulnerabilityRepository(options.db),
    observationRepository: createObservationRepository(options.db),
    roleRepository: createRoleRepository(options.db),
    userRoleRepository: createUserRoleRepository(options.db),
    userProfileRepository: createUserProfileRepository(options.db),
    userSessionRepository: createUserSessionRepository(options.db),
    vulnerabilityRepository: createVulnerabilityPersistenceRepository(options.db),
  };

  const authService = createAuthService({
    userProfileRepository: repositories.userProfileRepository,
    userSessionRepository: repositories.userSessionRepository,
    userRoleRepository: repositories.userRoleRepository,
    domainEventEmitter: eventBus,
    sessionLifetimeHours: options.authSessionLifetimeHours,
    sessionHmacSecret: options.authSessionHmacSecret,
    logger: loggerFactory("service/auth"),
  });
  const requireDomainPermission = createRequireDomainPermission(
    authService.userHasPermission.bind(authService),
  );
  const roleService = createRoleService({
    roleRepository: repositories.roleRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/role"),
  });
  const userProfileService = createUserProfileService({
    userProfileRepository: repositories.userProfileRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/user-profile"),
  });
  const assetCustomFieldService = createAssetCustomFieldService({
    assetCustomFieldRepository: repositories.assetCustomFieldRepository,
    assetRepository: repositories.assetRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/asset-custom-field"),
  });
  const assetService = createAssetService({
    assetRepository: repositories.assetRepository,
    assetCustomFieldReader: assetCustomFieldService,
    userProfileService,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/asset"),
  });
  const vulnerabilityService = createVulnerabilityService({
    vulnerabilityRepository: repositories.vulnerabilityRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/vulnerability"),
  });
  const findingService = createFindingService({
    findingPersistenceRepository: repositories.findingPersistenceRepository,
    findingVulnerabilityRepository: repositories.findingVulnerabilityRepository,
    observationRepository: repositories.observationRepository,
    assetService,
    userProfileService,
    vulnerabilityService,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/finding"),
  });
  const statsService = createStatsService({
    findingRepository: repositories.findingPersistenceRepository,
    logger: loggerFactory("service/stats"),
  });

  const csrfProtection = createCsrfProtection({
    allowedOrigins: [options.appOrigin],
    tokenSecret: options.authSessionHmacSecret,
    cookiePolicy: authCookiePolicy,
  });

  const routes = {
    healthRoute: health,
    authRoute: createAuthRoute(authService, {
      csrf: csrfProtection,
      cookiePolicy: authCookiePolicy,
      trustedProxies: options.authTrustedProxies,
    }),
    assetRoute: createAssetRoute(assetService, assetCustomFieldService, {
      requireDomainPermission,
    }),
    roleRoute: createRoleRoute(roleService, { requireDomainPermission }),
    userRoute: createUserRoute(userProfileService, { requireDomainPermission }),
    vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService, {
      requireDomainPermission,
    }),
    findingStatsRoute: createFindingStatsRoute(statsService, {
      requireDomainPermission,
    }),
    findingRoute: createFindingRoute(findingService, {
      requireDomainPermission,
    }),
    importerRoute: createImportRoute({
      requireDomainPermission,
    }),
  };

  const middleware = {
    annotateAuth: createAuthAnnotate(authService, authCookiePolicy),
    csrfProtection: csrfProtection.middleware,
    requireAuth: authNRequire(),
  };

  const app = createApp({
    logger: options.logger,
    accessLogger: options.accessLogger,
    appOrigin: options.appOrigin,
    staticDir: options.staticDir,
    apiTimeoutMs: options.apiTimeoutMs,
    annotateAuth: middleware.annotateAuth,
    csrfProtection: middleware.csrfProtection,
    requireAuth: middleware.requireAuth,
    ...routes,
  });

  return {
    repositories,
    services: {
      authService,
      assetService,
      assetCustomFieldService,
      roleService,
      userProfileService,
      vulnerabilityService,
      findingService,
      statsService,
    },
    routes,
    middleware,
    app,
    createDefaultAdmin: () =>
      createDefaultAdmin({
        db: options.db,
        logger: options.dbLogger ?? loggerFactory("db"),
      }),
  };
}
