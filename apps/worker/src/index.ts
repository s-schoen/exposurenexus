import { createBackendRuntime } from "@exposurenexus/backend";
import { checkDatabaseMigrations, createPostgresDatabase } from "@exposurenexus/backend/database";
import { createJobConsumer } from "@exposurenexus/jobs/consumer";

import { bootstrapWorker } from "./bootstrap.js";
import { openWorkerDatabase } from "./database.js";
import { createLogger } from "./logging.js";

bootstrapWorker(
  process.env,
  { signals: process, exit: (code) => process.exit(code) },
  {
    createLogger,
    createJobConsumer,
    openDatabase: (config, logger) =>
      openWorkerDatabase(config.DATABASE_URL, logger, {
        createPostgresDatabase,
        checkDatabaseMigrations,
        createBackendRuntime,
      }),
  },
);
