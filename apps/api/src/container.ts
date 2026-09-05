import { createBackendRuntime } from "@exposurenexus/backend";
import { createAssets } from "@exposurenexus/backend/assets";
import { createAuthentication } from "@exposurenexus/backend/authentication";
import { createExposures } from "@exposurenexus/backend/exposures";
import { createIdentity } from "@exposurenexus/backend/identity";

import { createApp } from "./app.js";
import { registerEventHandlers } from "./event-handler/index.js";
import { decorateAssetsWithEvents } from "./lib/assets-events.js";
import { decorateAuthenticationWithEvents } from "./lib/authentication-events.js";
import { createDefaultAdmin } from "./lib/default-admin.js";
import { EventBus } from "./lib/eventbus/eventbus.js";
import { decorateExposuresWithEvents } from "./lib/exposures-events.js";
import { decorateIdentityWithEvents } from "./lib/identity-events.js";
import { createLogger } from "./logging.js";
import {
  createAuthAnnotate,
  authNRequire,
  createRequireDomainPermission,
  createAuthCookiePolicy,
} from "./middleware/auth.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import { createAssetRoute } from "./routes/assets.js";
import { createAuthRoute } from "./routes/auth.js";
import { createFindingRoute } from "./routes/findings.js";
import health from "./routes/health.js";
import { createImportRoute } from "./routes/import.js";
import { createRoleRoute } from "./routes/roles.js";
import { createFindingStatsRoute } from "./routes/stats.js";
import { createUserRoute } from "./routes/users.js";
import { createVulnerabilityRoute } from "./routes/vulnerabilities.js";

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
  const backendIdentity = createIdentity(runtime);
  const identity = decorateIdentityWithEvents(backendIdentity, eventBus);
  const authentication = decorateAuthenticationWithEvents(
    createAuthentication(runtime, {
      sessionLifetimeHours: options.authSessionLifetimeHours,
      sessionHmacSecret: options.authSessionHmacSecret,
    }),
    eventBus,
  );
  const assets = decorateAssetsWithEvents(createAssets(runtime), eventBus);
  const exposures = decorateExposuresWithEvents(createExposures(runtime), eventBus);

  const requireDomainPermission = createRequireDomainPermission(
    identity.authorization.userHasPermission.bind(identity.authorization),
  );
  const csrfProtection = createCsrfProtection({
    allowedOrigins: [options.appOrigin],
    tokenSecret: options.authSessionHmacSecret,
    cookiePolicy: authCookiePolicy,
  });

  const routes = {
    healthRoute: health,
    authRoute: createAuthRoute(authentication, {
      csrf: csrfProtection,
      cookiePolicy: authCookiePolicy,
      trustedProxies: options.authTrustedProxies,
    }),
    assetRoute: createAssetRoute(assets.inventory, assets.customFields, {
      requireDomainPermission,
    }),
    roleRoute: createRoleRoute(identity.roles, { requireDomainPermission }),
    userRoute: createUserRoute(identity.users, { requireDomainPermission }),
    vulnerabilityRoute: createVulnerabilityRoute(exposures.vulnerabilities, {
      requireDomainPermission,
    }),
    findingStatsRoute: createFindingStatsRoute(exposures.statistics, {
      requireDomainPermission,
    }),
    findingRoute: createFindingRoute(exposures.findings, {
      requireDomainPermission,
    }),
    importerRoute: createImportRoute({
      requireDomainPermission,
    }),
  };

  const middleware = {
    annotateAuth: createAuthAnnotate(authentication, authCookiePolicy),
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
    services: {
      authentication,
      assets,
      identity,
      exposures,
    },
    routes,
    middleware,
    app,
    createDefaultAdmin: () =>
      createDefaultAdmin({
        users: backendIdentity.users,
        logger: options.dbLogger ?? loggerFactory("db"),
      }),
  };
}
