import { createPostgresDatabase, migrateToLatest } from "@exposurenexus/backend/database";
import { serve } from "@hono/node-server";

import { createAppContainer } from "./container.js";
import { env } from "./env.js";
import { createLogger } from "./logging.js";
import { createApiShutdown } from "./shutdown.js";

const logger = createLogger("api");
const auditLogger = createLogger("audit/api");
const dbLogger = createLogger("db");
const { database: db, pool } = createPostgresDatabase(env.DATABASE_URL);

try {
  await migrateToLatest(db, dbLogger);

  const container = createAppContainer({
    db,
    appOrigin: env.APP_ORIGIN,
    staticDir: env.STATIC_DIR,
    authSessionLifetimeHours: env.AUTH_SESSION_LIFETIME,
    authSessionHmacSecret: env.AUTH_SECRET,
    authCookieSecure: env.AUTH_COOKIE_SECURE,
    authTrustedProxies: env.AUTH_TRUSTED_PROXIES,
    apiTimeoutMs: env.API_TIMEOUT_MS,
    logger,
    accessLogger: auditLogger,
    dbLogger,
  });

  await container.createDefaultAdmin();

  const server = serve(
    {
      fetch: container.app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info(`server is running on localhost:${info.port}`);
    },
  );

  const shutdown = createApiShutdown(server, pool, logger);
  const requestShutdown = (signal: NodeJS.Signals): void => {
    void shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error, signal }, "failed to shut down API");
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", () => {
    requestShutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    requestShutdown("SIGTERM");
  });
} catch (error) {
  await pool.end();
  throw error;
}
