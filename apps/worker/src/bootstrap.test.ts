import { EventEmitter } from "node:events";

import { createJobEvent, JobType } from "@exposurenexus/jobs";
import { describe, expect, it, vi } from "vitest";

import { bootstrapWorker } from "./bootstrap.js";

import type { BackendRuntime } from "@exposurenexus/backend";
import type { JobEventType } from "@exposurenexus/jobs";
import type { JobHandler } from "@exposurenexus/jobs/consumer";
import type { Logger } from "pino";

function setup() {
  const environment = {
    DATABASE_URL: "postgres://user:secret@localhost/db",
    RABBITMQ_URL: "amqp://worker:secret@localhost",
    RABBITMQ_QUEUE: "worker-queue",
    STARTUP_TIMEOUT_MS: "1234",
    LOG_LEVEL: "debug",
    AUTH_SECRET: "invalid-but-irrelevant",
    S3_BUCKET: "scan-inputs",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
    S3_ENDPOINT: "http://localhost:7070",
    S3_FORCE_PATH_STYLE: "true",
  };
  const log = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  const logger = log as unknown as Logger;
  const hooks = { signals: new EventEmitter(), exit: vi.fn() };
  const database = {
    check: vi.fn(async () => {}),
    createRuntime: vi.fn(() => ({}) as BackendRuntime),
    close: vi.fn(async () => {}),
  };
  const storage = {
    bucket: environment.S3_BUCKET,
    write: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
  };
  const importSources = {
    register: vi.fn(),
    upload: vi.fn(),
    create: vi.fn(),
    getByID: vi.fn(),
    getByIngestionID: vi.fn(),
    readByID: vi.fn(),
    deleteByID: vi.fn(),
  };
  const ingestions = {
    submit: vi.fn(),
    process: vi.fn(async (_ingestionId: string) => ({
      importSourceId: "source-id",
      bytesRead: 42,
    })),
  };
  const lifetime = Promise.withResolvers<void>();
  const consumer = {
    start: vi.fn(() => lifetime.promise),
    waitForInitialActivation: vi.fn(async () => {}),
    registerJobHandler: vi.fn((_type: JobEventType, _handler: JobHandler) => {}),
    stop: vi.fn(async () => {
      lifetime.resolve();
    }),
  };
  const factories = {
    createLogger: vi.fn(() => logger),
    openDatabase: vi.fn(() => database),
    createJobConsumer: vi.fn(async () => consumer),
    createObjectStorage: vi.fn(() => storage),
    createImportSources: vi.fn(() => importSources),
    createIngestions: vi.fn(() => ingestions),
  };
  return {
    environment,
    log,
    logger,
    hooks,
    database,
    storage,
    importSources,
    ingestions,
    consumer,
    factories,
    run: () => bootstrapWorker(environment, hooks, factories),
  };
}

describe("worker bootstrap", () => {
  it("composes storage and the real ingestion handler, activating consumption without a probe", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    expect(f.factories.createLogger.mock.calls).toEqual([[], ["debug"]]);
    expect(f.factories.openDatabase).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ DATABASE_URL: f.environment.DATABASE_URL }),
      f.logger,
    );
    expect(f.database.check).toHaveBeenCalledOnce();
    expect(f.database.createRuntime).toHaveBeenCalledOnce();
    expect(f.factories.createJobConsumer).toHaveBeenCalledExactlyOnceWith({
      connectionOptions: f.environment.RABBITMQ_URL,
      queueName: "worker-queue",
      socketOptions: { timeout: 1234 },
      logger: f.logger,
    });
    expect(f.factories.createObjectStorage).toHaveBeenCalledExactlyOnceWith({
      bucket: "scan-inputs",
      region: "us-east-1",
      credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
      endpoint: "http://localhost:7070",
      forcePathStyle: true,
    });
    expect(f.factories.createImportSources).toHaveBeenCalledExactlyOnceWith(
      f.database.createRuntime.mock.results[0].value,
      f.storage,
    );
    expect(f.factories.createIngestions).toHaveBeenCalledExactlyOnceWith(
      f.database.createRuntime.mock.results[0].value,
      f.importSources,
    );
    expect(f.storage.read).not.toHaveBeenCalled();
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
    expect(f.consumer.start).toHaveBeenCalledOnce();
    expect(f.consumer.registerJobHandler).toHaveBeenCalledExactlyOnceWith(
      JobType.INGESTION,
      expect.any(Function),
    );
    expect(f.log.info).toHaveBeenCalledWith(
      { mode: "consuming" },
      expect.stringContaining("startup completed"),
    );
    f.hooks.signals.emit("SIGTERM");
    await worker.stopped;
    expect(f.consumer.stop).toHaveBeenCalledOnce();
    expect(f.database.close).toHaveBeenCalledOnce();
    expect(f.storage.close).toHaveBeenCalledOnce();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("awaits accepted shell work before logging completion and releasing storage, including duplicate delivery", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const event = createJobEvent({
      type: JobType.INGESTION,
      source: "/services/api",
      data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
    });
    const completed = { importSourceId: "source-id", bytesRead: 42 };
    await handler(event);
    // A broker redelivery runs the same read-only use case again, without execution claims.
    f.log.info.mockClear();
    const reading = Promise.withResolvers<typeof completed>();
    f.ingestions.process.mockReturnValueOnce(reading.promise);
    const handling = handler(event);
    const settled = vi.fn();
    void Promise.resolve(handling).then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(f.log.info).not.toHaveBeenCalledWith(expect.anything(), "ingestion shell completed");
    f.consumer.stop.mockImplementationOnce(async () => {
      await handling;
    });
    const stopping = worker.shutdown();
    await Promise.resolve();
    expect(f.storage.close).not.toHaveBeenCalled();
    expect(f.database.close).not.toHaveBeenCalled();
    reading.resolve(completed);
    await handling;
    await stopping;
    expect(f.storage.close).toHaveBeenCalledOnce();
    expect(f.ingestions.process.mock.calls).toEqual([
      [event.data.ingestionId],
      [event.data.ingestionId],
    ]);
    expect(f.log.info).toHaveBeenCalledWith(
      { jobId: event.id, ingestionId: event.data.ingestionId, ...completed },
      "ingestion shell completed",
    );
    expect(
      f.log.info.mock.calls.filter(([, message]) => message === "ingestion shell completed"),
    ).toHaveLength(1);
    expect(f.ingestions.submit).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
  });

  it("propagates shell failures to the consumer without logging false completion or duplicate errors", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const failure = new Error("source read failed");
    f.ingestions.process.mockRejectedValueOnce(failure);
    await expect(
      handler(
        createJobEvent({
          type: JobType.INGESTION,
          source: "/services/api",
          data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
        }),
      ),
    ).rejects.toBe(failure);
    expect(f.log.info).not.toHaveBeenCalledWith(expect.anything(), "ingestion shell completed");
    expect(f.log.error).not.toHaveBeenCalled();
    await worker.shutdown();
  });

  it.each([
    [{ DATABASE_URL: "not-a-url-with-secret" }, "DATABASE_URL"],
    [{ S3_SECRET_ACCESS_KEY: "" }, "S3_SECRET_ACCESS_KEY"],
    [
      { DATABASE_URL: "", RABBITMQ_URL: "", LOG_LEVEL: "secret-invalid-level" },
      "DATABASE_URL, RABBITMQ_URL, LOG_LEVEL",
    ],
  ])("rejects invalid configuration before acquiring resources", (invalid, fields) => {
    const f = setup();
    Object.assign(f.environment, invalid);
    expect(f.run()).toBeUndefined();
    expect(f.factories.openDatabase).not.toHaveBeenCalled();
    expect(f.factories.createObjectStorage).not.toHaveBeenCalled();
    expect(f.factories.createJobConsumer).not.toHaveBeenCalled();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.fatal).toHaveBeenCalledExactlyOnceWith(`Invalid worker configuration: ${fields}`);
    expect(JSON.stringify(f.log.fatal.mock.calls)).not.toContain("secret");
  });

  it("does not expose arbitrary bootstrap errors resembling validation errors", () => {
    const f = setup();
    f.factories.createLogger
      .mockImplementationOnce(() => f.logger)
      .mockImplementationOnce(() => {
        throw new Error("Invalid worker configuration: amqp://user:secret@host");
      });
    expect(f.run()).toBeUndefined();
    expect(f.hooks.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.log.fatal).toHaveBeenCalledExactlyOnceWith(
      "worker configuration or bootstrap failed; check required worker settings",
    );
    expect(f.factories.openDatabase).not.toHaveBeenCalled();
  });
});
