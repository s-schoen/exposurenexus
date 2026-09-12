import type { createApp } from "./app.js";
import type { ApiHttp } from "./http.js";
import type { Database } from "@exposurenexus/backend/database";
import type { JobProducer } from "@exposurenexus/jobs/producer";
import type { JobRelay } from "@exposurenexus/jobs/relay";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

type ApiApplication = Pick<ReturnType<typeof createApp>, "fetch">;

export interface ApiDependencies {
  openDatabase(): Kysely<Database>;
  initializeApplication(database: Kysely<Database>): Promise<ApiApplication>;
  openProducer(): Promise<JobProducer>;
  createRelay(database: Kysely<Database>, producer: JobProducer): JobRelay;
  openHttp(application: ApiApplication, onError: () => void): ApiHttp;
  signals: {
    on(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
    removeListener(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  };
  exit(code: number): void;
}

export function runApi({
  config,
  logger,
  dependencies,
}: {
  config: { STARTUP_TIMEOUT_MS: number; SHUTDOWN_TIMEOUT_MS: number };
  logger: Pick<Logger, "info" | "error" | "fatal">;
  dependencies: ApiDependencies;
}) {
  let database: Kysely<Database> | undefined;
  let producer: JobProducer | undefined;
  let relay: JobRelay | undefined;
  let http: ApiHttp | undefined;
  let stopping = false;
  let finished = false;
  let exitCode = 0;
  let stage = "database acquisition";
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  const ready = Promise.withResolvers<boolean>();
  const stopped = Promise.withResolvers<void>();
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

  async function close(resource: string, action: () => Promise<void> | undefined) {
    try {
      await action();
    } catch {
      exitCode = 1;
      logger.error({ resource }, "API resource shutdown failed");
    }
  }

  function shutdown({
    reason = "requested",
    code = 0,
  }: { reason?: string; code?: number } = {}): Promise<void> {
    exitCode = Math.max(exitCode, code);
    if (stopping || finished) return stopped.promise;
    stopping = true;
    ready.resolve(false);
    shutdownRequested.resolve();
    clearTimeout(startupTimer);
    logger.info({ reason }, "API shutdown started");
    // Keep the deadline referenced and independent of acquisition and drain promises.
    shutdownTimer = setTimeout(() => {
      logger.fatal("API shutdown deadline expired");
      finish(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    void (async () => {
      await startup;
      if (finished) return;
      await Promise.all([close("HTTP", () => http?.close()), close("relay", () => relay?.stop())]);
      if (finished) return;
      await Promise.all([
        close("producer", () => producer?.close()),
        close("database", () => database?.destroy()),
      ]);
      if (finished) return;
      logger.info({ exitCode }, "API shutdown completed");
      finish(exitCode);
    })();
    return stopped.promise;
  }

  function onSignal() {
    void shutdown({ reason: "signal" });
  }

  dependencies.signals.on("SIGINT", onSignal);
  dependencies.signals.on("SIGTERM", onSignal);
  const startupTimer = setTimeout(() => {
    logger.error({ stage }, "API startup deadline expired");
    void shutdown({ reason: "startup timeout", code: 1 });
  }, config.STARTUP_TIMEOUT_MS);

  // Install lifecycle state and signal handlers before acquiring resources.
  const startup = Promise.resolve().then(async () => {
    try {
      if (stopping) return;
      database = dependencies.openDatabase();
      if (stopping) return;
      stage = "migrations and initialization";
      const application = await dependencies.initializeApplication(database);
      if (stopping) return;
      stage = "broker connection and exchange check";
      producer = await dependencies.openProducer();
      if (stopping) return;
      stage = "relay activation";
      relay = dependencies.createRelay(database, producer);
      if (stopping) return;
      await Promise.race([relay.start(), shutdownRequested.promise]);
      if (stopping) return;
      stage = "HTTP bind";
      http = dependencies.openHttp(application, () => {
        logger.error("API HTTP server failed");
        void shutdown({ reason: "HTTP failure", code: 1 });
      });
      await Promise.race([http.ready, shutdownRequested.promise]);
      if (stopping) return;
      clearTimeout(startupTimer);
      logger.info("API startup completed");
      ready.resolve(true);
    } catch {
      logger.error({ stage }, "API startup failed");
      void shutdown({ reason: "startup failure", code: 1 });
    }
  });

  return { ready: ready.promise, stopped: stopped.promise, shutdown };
}
