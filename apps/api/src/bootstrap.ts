import { createPostgresDatabase, migrateToLatest } from "@exposurenexus/backend/database";
import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { createJobProducer } from "@exposurenexus/jobs/producer";
import { createJobRelay } from "@exposurenexus/jobs/relay";

import { createAppContainer } from "./container.js";
import { openHttp } from "./http.js";
import { runApi } from "./lifecycle.js";
import { createApiLoggers } from "./logging.js";

import type { env } from "./env.js";
import type { ApiDependencies } from "./lifecycle.js";
import type { Database } from "@exposurenexus/backend/database";
import type { Kysely } from "kysely";

export function bootstrapApi(
  config: typeof env,
  processHooks: Pick<ApiDependencies, "signals" | "exit"> = {
    signals: process,
    exit: (code) => process.exit(code),
  },
) {
  const { logger, accessLogger, infrastructureLogger, dbLogger, loggerFactory } = createApiLoggers(
    config.LOG_LEVEL,
  );

  function openDatabase() {
    const { database, pool } = createPostgresDatabase(config.DATABASE_URL);
    pool.on("error", () => logger.error("API database connection error"));
    return database;
  }

  async function initializeApplication(db: Kysely<Database>) {
    await migrateToLatest(db, dbLogger);
    const container = createAppContainer({
      db,
      appOrigin: config.APP_ORIGIN,
      staticDir: config.STATIC_DIR,
      authSessionLifetimeHours: config.AUTH_SESSION_LIFETIME,
      authSessionHmacSecret: config.AUTH_SECRET,
      authCookieSecure: config.AUTH_COOKIE_SECURE,
      authTrustedProxies: config.AUTH_TRUSTED_PROXIES,
      apiTimeoutMs: config.API_TIMEOUT_MS,
      logger,
      accessLogger,
      dbLogger,
      loggerFactory,
    });
    await container.createDefaultAdmin();
    return container.app;
  }

  return runApi({
    config,
    logger,
    dependencies: {
      ...processHooks,
      openDatabase,
      initializeApplication,
      openProducer: () =>
        createJobProducer({
          connectionOptions: config.RABBITMQ_URL,
          exchangeName: config.RABBITMQ_EXCHANGE,
          socketOptions: { timeout: config.STARTUP_TIMEOUT_MS },
          logger: infrastructureLogger,
        }),
      createRelay: (db, producer) =>
        createJobRelay({
          repository: createJobRepository(db),
          producer,
          logger: infrastructureLogger,
        }),
      openHttp: (application, onError) =>
        openHttp({ fetch: application.fetch, port: config.PORT, onError }),
    },
  });
}
