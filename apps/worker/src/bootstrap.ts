import { JobType } from "@exposurenexus/jobs";

import { readConfig, WorkerConfigurationError } from "./env.js";
import { runWorker } from "./worker.js";

import type { WorkerConfig } from "./env.js";
import type { createLogger } from "./logging.js";
import type { WorkerDependencies } from "./worker.js";
import type { createImportSources } from "@exposurenexus/backend/import-sources";
import type { createIngestions } from "@exposurenexus/backend/ingestions";
import type { createObjectStorage } from "@exposurenexus/backend/object-storage";
import type { createJobConsumer } from "@exposurenexus/jobs/consumer";
import type { Logger } from "pino";

export function bootstrapWorker(
  environment: NodeJS.ProcessEnv,
  hooks: Pick<WorkerDependencies, "signals" | "exit">,
  factories: {
    createLogger: typeof createLogger;
    openDatabase(
      config: WorkerConfig,
      logger: Logger,
    ): ReturnType<WorkerDependencies["openDatabase"]>;
    createJobConsumer: typeof createJobConsumer;
    createObjectStorage: typeof createObjectStorage;
    createImportSources: typeof createImportSources;
    createIngestions: typeof createIngestions;
  },
) {
  const bootstrapLogger = factories.createLogger();
  try {
    const config = readConfig(environment);
    const logger = factories.createLogger(config.LOG_LEVEL);
    return runWorker(config, logger, {
      ...hooks,
      openDatabase: () => factories.openDatabase(config, logger),
      openStorage: () =>
        factories.createObjectStorage({
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          credentials: {
            accessKeyId: config.S3_ACCESS_KEY_ID,
            secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          },
          endpoint: config.S3_ENDPOINT,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        }),
      openConsumer: () =>
        factories.createJobConsumer({
          connectionOptions: config.RABBITMQ_URL,
          queueName: config.RABBITMQ_QUEUE,
          socketOptions: { timeout: config.STARTUP_TIMEOUT_MS },
          logger,
        }),
      createHandlers: (runtime, storage) => {
        const ingestions = factories.createIngestions(
          runtime,
          factories.createImportSources(runtime, storage),
        );
        return {
          [JobType.INGESTION]: async (event) => {
            const fields = { jobId: event.id, ingestionId: event.data.ingestionId };
            logger.info(fields, "ingestion shell started");
            const result = await ingestions.process(event.data.ingestionId);
            logger.info({ ...fields, ...result }, "ingestion shell completed");
          },
        };
      },
    });
  } catch (error) {
    bootstrapLogger.fatal(
      error instanceof WorkerConfigurationError
        ? error.message
        : "worker configuration or bootstrap failed; check required worker settings",
    );
    hooks.exit(1);
  }
}
