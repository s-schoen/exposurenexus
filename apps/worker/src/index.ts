import { createBackendRuntime } from "@exposurenexus/backend";
import { createAssets } from "@exposurenexus/backend/assets";
import { checkDatabaseMigrations, createPostgresDatabase } from "@exposurenexus/backend/database";
import { createFindings } from "@exposurenexus/backend/findings";
import { createImportSources } from "@exposurenexus/backend/import-sources";
import { createIngestions } from "@exposurenexus/backend/ingestions";
import { createObjectStorage } from "@exposurenexus/backend/object-storage";
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
    createObjectStorage,
    createImportSources,
    createIngestions,
    createAssets,
    createFindings,
    openDatabase: (config, logger) =>
      openWorkerDatabase(config.DATABASE_URL, logger, {
        createPostgresDatabase,
        checkDatabaseMigrations,
        createBackendRuntime,
      }),
  },
);
