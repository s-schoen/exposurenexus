import { createBackendRuntime } from "@exposurenexus/backend";
import { createIdentity } from "@exposurenexus/backend/identity";

import { createApp } from "./app.js";
import { registerEventHandlers } from "./event-handler/index.js";
import { createDefaultAdmin } from "./lib/default-admin.js";
import { EventBus } from "./lib/eventbus/eventbus.js";
import { decorateIdentityWithEvents } from "./lib/identity-events.js";
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
  createAuthUserRepository,
  createFindingRepository,
  createObservationRepository,
  createUserSessionRepository,
  createVulnerabilityRepository,
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
  createStatsService,
  createVulnerabilityService,
} from "./service/index.js";

import type { DomainEvent } from "./lib/eventbus/events/index.js";
import type { Database } from "@exposurenexus/backend/database";
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
  const runtime = createBackendRuntime({
    database: options.db,
    logger: loggerFactory("backend"),
  });
  const identity = decorateIdentityWithEvents(createIdentity(runtime), eventBus);

  const repositories = {
    assetCustomFieldRepository: createAssetCustomFieldRepository(options.db),
    assetRepository: createAssetRepository(options.db),
    authUserRepository: createAuthUserRepository(options.db),
    findingRepository: createFindingRepository(options.db),
    observationRepository: createObservationRepository(options.db),
    userSessionRepository: createUserSessionRepository(options.db),
    vulnerabilityRepository: createVulnerabilityRepository(options.db),
  };

  const authService = createAuthService({
    userProfileRepository: repositories.authUserRepository,
    userSessionRepository: repositories.userSessionRepository,
    domainEventEmitter: eventBus,
    sessionLifetimeHours: options.authSessionLifetimeHours,
    sessionHmacSecret: options.authSessionHmacSecret,
    logger: loggerFactory("service/auth"),
  });
  const requireDomainPermission = createRequireDomainPermission(
    identity.authorization.userHasPermission.bind(identity.authorization),
  );
  const assetCustomFieldService = createAssetCustomFieldService({
    assetCustomFieldRepository: repositories.assetCustomFieldRepository,
    assetRepository: repositories.assetRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/asset-custom-field"),
  });
  const assetService = createAssetService({
    assetRepository: repositories.assetRepository,
    assetCustomFieldReader: assetCustomFieldService,
    userProfileService: identity.users,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/asset"),
  });
  const vulnerabilityService = createVulnerabilityService({
    vulnerabilityRepository: repositories.vulnerabilityRepository,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/vulnerability"),
  });
  const findingService = createFindingService({
    findingRepository: repositories.findingRepository,
    observationRepository: repositories.observationRepository,
    assetService,
    userProfileService: identity.users,
    vulnerabilityService,
    domainEventEmitter: eventBus,
    logger: loggerFactory("service/finding"),
  });
  const statsService = createStatsService({
    findingRepository: repositories.findingRepository,
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
    roleRoute: createRoleRoute(identity.roles, { requireDomainPermission }),
    userRoute: createUserRoute(identity.users, { requireDomainPermission }),
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
      identity,
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
