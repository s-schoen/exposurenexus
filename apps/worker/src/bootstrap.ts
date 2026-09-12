import { readConfig, WorkerConfigurationError } from "./env.js";
import { runWorker } from "./worker.js";

import type { WorkerConfig } from "./env.js";
import type { createLogger } from "./logging.js";
import type { WorkerDependencies } from "./worker.js";
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
  },
) {
  const bootstrapLogger = factories.createLogger();
  try {
    const config = readConfig(environment);
    const logger = factories.createLogger(config.LOG_LEVEL);
    return runWorker(config, logger, {
      ...hooks,
      openDatabase: () => factories.openDatabase(config, logger),
      openConsumer: () =>
        factories.createJobConsumer({
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
    hooks.exit(1);
  }
}
