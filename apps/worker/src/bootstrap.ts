import { JobType } from "@exposurenexus/jobs";

import { identifierInventorySnapshotFrom } from "./classification/asset-classifiers/asset-inventory-adapter.js";
import { IdentifierAssetMatcher } from "./classification/asset-classifiers/identifier-matcher.js";
import { findingIdentitySourceFrom } from "./classification/finding-classifiers/finding-identity-adapter.js";
import { IdentityFindingMatcher } from "./classification/finding-classifiers/identity-matcher.js";
import { createScannerClassifier } from "./classification/normalizers/registry.js";
import { readConfig, WorkerConfigurationError } from "./env.js";
import { createIngestionPipeline } from "./ingestion/pipeline.js";
import { runWorker } from "./worker.js";

import type { WorkerConfig } from "./env.js";
import type { createLogger } from "./logging.js";
import type { WorkerDependencies } from "./worker.js";
import type { createAssets } from "@exposurenexus/backend/assets";
import type { createFindings } from "@exposurenexus/backend/findings";
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
    createAssets: typeof createAssets;
    createFindings: typeof createFindings;
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
        const inventory = factories.createAssets(runtime).inventory;
        const pipeline = createIngestionPipeline({
          ingestions: factories.createIngestions(
            runtime,
            factories.createImportSources(runtime, storage),
          ),
          classifier: createScannerClassifier(logger),
          createAssetMatcher: () =>
            new IdentifierAssetMatcher(identifierInventorySnapshotFrom(inventory)),
          findingMatcher: new IdentityFindingMatcher(
            findingIdentitySourceFrom(factories.createFindings(runtime)),
          ),
        });
        return {
          [JobType.INGESTION]: (event) =>
            pipeline.run(event.data.ingestionId, logger.child({ jobId: event.id })),
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
