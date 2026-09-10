import { createBackendRuntime } from "@exposurenexus/backend";
import { checkDatabaseMigrations, createPostgresDatabase } from "@exposurenexus/backend/database";
import { createJobConsumer } from "@exposurenexus/jobs/consumer";

import { readConfig, WorkerConfigurationError } from "./env.js";
import { createLogger } from "./logging.js";
import { runWorker } from "./worker.js";

const bootstrapLogger = createLogger();
try {
  const config = readConfig(process.env);
  const logger = createLogger(config.LOG_LEVEL);
  runWorker(config, logger, {
    signals: process,
    exit: (code) => process.exit(code),
    openDatabase() {
      const { database, pool } = createPostgresDatabase(config.DATABASE_URL);
      pool.on("error", () => logger.error("worker database connection error"));
      return {
        async check() {
          await pool.query("select 1");
          try {
            await checkDatabaseMigrations(database);
          } catch {
            logger.error(
              "worker migration verification failed; ensure API migrations have completed",
            );
            throw new Error("Worker database migration verification failed");
          }
        },
        createRuntime: () => createBackendRuntime({ database, logger }),
        // Kysely owns and closes the pool; do not call pool.end() twice.
        close: () => database.destroy(),
      };
    },
    openConsumer: () =>
      createJobConsumer({
        connectionOptions: config.RABBITMQ_URL,
        queueName: config.RABBITMQ_QUEUE,
        socketOptions: { timeout: config.STARTUP_TIMEOUT_MS },
        logger,
      }),
    createHandlers: () => ({}),
  });
} catch (error) {
  bootstrapLogger.fatal(
    error instanceof WorkerConfigurationError
      ? error.message
      : "worker configuration or bootstrap failed; check required worker settings",
  );
  process.exit(1);
}
