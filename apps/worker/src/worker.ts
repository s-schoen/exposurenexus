import { JobType } from "@exposurenexus/jobs";

import type { WorkerConfig } from "./env.js";
import type { BackendRuntime } from "@exposurenexus/backend";
import type { ObjectStorage } from "@exposurenexus/backend/object-storage";
import type { JobEventType } from "@exposurenexus/jobs";
import type { JobConsumer, JobHandler } from "@exposurenexus/jobs/consumer";
import type { Logger } from "pino";

export type WorkerHandlers = { [T in JobEventType]?: JobHandler<T> };

export interface WorkerDatabase {
  check(): Promise<void>;
  createRuntime(): BackendRuntime;
  close(): Promise<void>;
}

export interface WorkerDependencies {
  openDatabase(): WorkerDatabase;
  openStorage(): ObjectStorage;
  openConsumer(): Promise<JobConsumer>;
  createHandlers(runtime: BackendRuntime, storage: ObjectStorage): WorkerHandlers;
  signals: {
    on(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
    removeListener(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  };
  exit(code: number): void;
}

export function runWorker(config: WorkerConfig, logger: Logger, dependencies: WorkerDependencies) {
  let database: WorkerDatabase | undefined;
  let storage: ObjectStorage | undefined;
  let consumer: JobConsumer | undefined;
  let stopping = false;
  let finished = false;
  let exitCode = 0;
  let stage = "database initialization";
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  const stopped = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<boolean>();
  const shutdownRequested = Promise.withResolvers<void>();

  function finish(code: number) {
    if (finished) return;
    finished = true;
    clearTimeout(startupTimer);
    clearTimeout(shutdownTimer);
    dependencies.signals.removeListener("SIGINT", onSignal);
    dependencies.signals.removeListener("SIGTERM", onSignal);
    ready.resolve(false);
    stopped.resolve();
    dependencies.exit(code);
  }

  function shutdown(reason = "requested", code = 0): Promise<void> {
    exitCode = Math.max(exitCode, code);
    if (stopping || finished) return stopped.promise;
    stopping = true;
    shutdownRequested.resolve();
    clearTimeout(startupTimer);
    logger.info({ reason }, "worker shutdown started");
    // This timer must remain referenced and independent of acquisition/drain promises.
    shutdownTimer = setTimeout(() => {
      logger.fatal("worker shutdown deadline expired; unfinished work remains unacknowledged");
      finish(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    void (async () => {
      await startup;
      if (finished) return;
      try {
        await consumer?.stop();
      } catch {
        logger.error("worker consumer shutdown failed");
        // Drain is not known to have completed; retain storage and database until forced exit.
        exitCode = 1;
        return;
      }
      if (finished) return;
      try {
        storage?.close();
      } catch {
        exitCode = 1;
        logger.error("worker storage shutdown failed");
      }
      try {
        await database?.close();
      } catch {
        exitCode = 1;
        logger.error("worker database shutdown failed");
      }
      if (finished) return;
      logger.info({ exitCode }, "worker shutdown completed");
      finish(exitCode);
    })();
    return stopped.promise;
  }

  function onSignal() {
    void shutdown("signal");
  }

  dependencies.signals.on("SIGINT", onSignal);
  dependencies.signals.on("SIGTERM", onSignal);
  const startupTimer = setTimeout(() => {
    logger.error({ stage }, "worker startup deadline expired");
    void shutdown("startup timeout", 1);
  }, config.STARTUP_TIMEOUT_MS);

  // Defer acquisition until all lifecycle state and signal handlers are installed.
  const startup = Promise.resolve().then(async () => {
    try {
      if (stopping) return;
      database = dependencies.openDatabase();
      if (stopping) return;
      stage = "database connectivity and migrations";
      await database.check();
      if (stopping) return;
      stage = "storage initialization";
      storage = dependencies.openStorage();
      if (stopping) return;
      stage = "backend runtime and handlers";
      const handlers = dependencies.createHandlers(database.createRuntime(), storage);
      if (stopping) return;
      const declared = Object.values(JobType);
      const implemented = Object.keys(handlers);
      const idle = implemented.length === 0;
      if (
        !idle &&
        (implemented.length !== declared.length ||
          declared.some((type) => typeof handlers[type] !== "function"))
      ) {
        throw new Error("Worker handler set must be empty or complete");
      }
      stage = "broker connection and queue check";
      consumer = await dependencies.openConsumer();
      if (stopping) return;
      if (!idle) {
        stage = "consumer activation";
        for (const type of declared) {
          consumer.registerJobHandler(type, handlers[type]!);
        }
        // start() is a lifetime, not a readiness promise. Observe both outcomes.
        void consumer.start().then(
          () => {
            if (!stopping) void shutdown("consumer stopped unexpectedly", 1);
          },
          () => {
            logger.error("worker consumer lifetime failed");
            void shutdown("consumer failure", 1);
          },
        );
        // A signal must release startup's wait so shutdown can stop the consumer,
        // even when the broker never completes subscription setup.
        await Promise.race([consumer.waitForInitialActivation(), shutdownRequested.promise]);
        if (stopping) return;
      }
      clearTimeout(startupTimer);
      if (idle) logger.info("worker intentionally idle; no handlers implemented, no subscription");
      logger.info(
        { mode: idle ? "idle" : "consuming" },
        "worker startup completed; dependencies verified",
      );
      ready.resolve(true);
    } catch {
      logger.error({ stage }, "worker startup failed");
      void shutdown("startup failure", 1);
    } finally {
      if (stopping) ready.resolve(false);
    }
  });

  return { ready: ready.promise, stopped: stopped.promise, shutdown };
}
