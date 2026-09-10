import { createPostgresDatabase, migrateToLatest } from "@exposurenexus/backend/database";
import { createJobRepository } from "@exposurenexus/jobs/postgres";
import { createJobProducer } from "@exposurenexus/jobs/producer";
import { createJobRelay } from "@exposurenexus/jobs/relay";
import { serve } from "@hono/node-server";

import { createAppContainer } from "./container.js";
import { env } from "./env.js";
import { runApi } from "./lifecycle.js";
import { createLogger } from "./logging.js";

const logger = createLogger("api");
const auditLogger = createLogger("audit/api");
const infrastructureLogger = createLogger("infrastructure", {
  serializers: { err: () => "infrastructure error" },
  hooks: {
    logMethod(args, method) {
      const first = args[0];
      // Pino derives msg from the original error before running its err serializer.
      if (
        args[1] === undefined &&
        typeof first === "object" &&
        first !== null &&
        (first instanceof Error || "err" in first)
      ) {
        args[1] = "infrastructure error";
      }
      method.apply(this, args);
    },
  },
});
const dbLogger = infrastructureLogger.child({ name: "db" });

runApi({
  config: env,
  logger,
  dependencies: {
    signals: process,
    exit: (code) => process.exit(code),
    openDatabase() {
      const { database: db, pool } = createPostgresDatabase(env.DATABASE_URL);
      pool.on("error", () => logger.error("API database connection error"));
      let container: ReturnType<typeof createAppContainer>;
      return {
        async initialize() {
          await migrateToLatest(db, dbLogger);
          container = createAppContainer({
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
        },
        createRelay: (producer) =>
          createJobRelay({
            repository: createJobRepository(db),
            producer,
            logger: infrastructureLogger,
          }),
        openHttp(onError) {
          const ready = Promise.withResolvers<void>();
          const server = serve({ fetch: container.app.fetch, port: env.PORT }, () =>
            ready.resolve(),
          );
          server.on("error", () => {
            ready.reject(new Error("HTTP server failed"));
            onError();
          });
          return {
            ready: ready.promise,
            close: () =>
              new Promise<void>((resolve, reject) => {
                server.close((error?: NodeJS.ErrnoException) => {
                  // A failed bind never started listening, but is still an owned server.
                  if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
                  else resolve();
                });
              }),
          };
        },
        close: () => db.destroy(),
      };
    },
    openProducer: () =>
      createJobProducer({
        connectionOptions: env.RABBITMQ_URL,
        exchangeName: env.RABBITMQ_EXCHANGE,
        socketOptions: { timeout: env.STARTUP_TIMEOUT_MS },
        logger: infrastructureLogger,
      }),
  },
});
