import { EventEmitter } from "node:events";

import { createJobEvent, JobType } from "@exposurenexus/jobs";
import { describe, expect, it, vi } from "vitest";

import { bootstrapWorker } from "./bootstrap.js";
import { recordingLogger } from "./test/logger.js";

import type { BackendRuntime } from "@exposurenexus/backend";
import type { IngestionStatus, ProcessedIngestion } from "@exposurenexus/backend/ingestions";
import type { JobEventType } from "@exposurenexus/jobs";
import type { JobHandler } from "@exposurenexus/jobs/consumer";
import type { Logger } from "pino";

const assetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nucleiRecord = {
  "template-id": "swagger-api",
  info: { name: "Public Swagger API", severity: "info", classification: { "cwe-id": ["cwe-200"] } },
  type: "http",
  host: "shop.example.com",
  "matched-at": "https://shop.example.com/api-docs/swagger.yaml",
  timestamp: "2026-10-01T10:00:00.000Z",
};

function processed(
  ingestionId: string,
  status: IngestionStatus = "pending",
  data = new TextEncoder().encode(`${JSON.stringify(nucleiRecord)}\n`),
): ProcessedIngestion {
  return {
    ingestion: {
      id: ingestionId,
      source: "nuclei",
      createdBy: "22222222-2222-4222-8222-222222222222",
      createdAt: new Date("2026-10-08T12:00:00.000Z"),
      status,
    },
    importSourceId: "source-id",
    data,
  };
}

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
  const scoped = recordingLogger();
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((bindings: Record<string, unknown>) => scoped.child(bindings)),
  };
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
    fail: vi.fn(async () => ({ status: "failed" as const })),
    record: vi.fn(async () => ({
      status: "recorded" as const,
      createdFindingIds: ["44444444-4444-4444-8444-444444444444"],
      attachedObservations: 0,
      reopenedFindingIds: [],
    })),
    process: vi.fn(async (ingestionId: string) => processed(ingestionId)),
  };
  const inventory = {
    listAll: vi.fn(async () => [
      {
        id: assetId,
        identifiers: [{ type: "dnsName", namespace: null, value: "shop.example.com" }],
      },
    ]),
  };
  const findings = { listIdentities: vi.fn(async () => []) };
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
    createAssets: vi.fn(() => ({ inventory }) as never),
    createFindings: vi.fn(() => findings as never),
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
    inventory,
    findings,
    entries: scoped.entries,
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
    expect(f.factories.createAssets).toHaveBeenCalledExactlyOnceWith(
      f.database.createRuntime.mock.results[0].value,
    );
    expect(f.factories.createFindings).toHaveBeenCalledExactlyOnceWith(
      f.database.createRuntime.mock.results[0].value,
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

  it("runs a delivery through normalization and both matchers to a recorded plan", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const event = createJobEvent({
      type: JobType.INGESTION,
      source: "/services/api",
      data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
    });

    await handler(event);

    expect(f.ingestions.process).toHaveBeenCalledExactlyOnceWith(event.data.ingestionId);
    expect(f.inventory.listAll).toHaveBeenCalledOnce();
    expect(f.findings.listIdentities).toHaveBeenCalledExactlyOnceWith(assetId);
    expect(f.ingestions.record).toHaveBeenCalledExactlyOnceWith(event.data.ingestionId, {
      newFindings: [
        {
          assetId,
          finding: {
            title: "Public Swagger API",
            severity: "info",
            weakness: { identifiers: { cwe: ["CWE-200"], nuclei: ["swagger-api"] } },
            affectedResource: {
              type: "webEndpoint",
              scheme: "https",
              host: "shop.example.com",
              port: 443,
              path: "/api-docs/swagger.yaml",
              component: { kind: "endpoint" },
            },
          },
          observations: [
            expect.objectContaining({
              title: "Public Swagger API",
              observedAt: new Date("2026-10-01T10:00:00.000Z"),
            }),
          ],
        },
      ],
      attachments: [],
    });
    expect(f.entries).toContainEqual({
      level: "info",
      fields: expect.objectContaining({
        jobId: event.id,
        ingestionId: event.data.ingestionId,
        candidates: 1,
        newFindings: 1,
      }),
      message: "ingestion completed",
    });
    expect(f.storage.delete).not.toHaveBeenCalled();
    await worker.shutdown();
  });

  it("matches each delivery against a fresh inventory read", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const event = createJobEvent({
      type: JobType.INGESTION,
      source: "/services/api",
      data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
    });

    await handler(event);
    await handler(event);

    expect(f.inventory.listAll).toHaveBeenCalledTimes(2);
    await worker.shutdown();
  });

  it("awaits accepted work before releasing storage", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const event = createJobEvent({
      type: JobType.INGESTION,
      source: "/services/api",
      data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
    });
    const reading = Promise.withResolvers<ProcessedIngestion>();
    f.ingestions.process.mockReturnValueOnce(reading.promise);
    const handling = handler(event);
    const settled = vi.fn();
    void Promise.resolve(handling).then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    f.consumer.stop.mockImplementationOnce(async () => {
      await handling;
    });
    const stopping = worker.shutdown();
    await Promise.resolve();
    expect(f.storage.close).not.toHaveBeenCalled();
    expect(f.database.close).not.toHaveBeenCalled();
    reading.resolve(processed(event.data.ingestionId));
    await handling;
    await stopping;
    expect(f.ingestions.record).toHaveBeenCalledOnce();
    expect(f.storage.close).toHaveBeenCalledOnce();
  });

  it("fails an ingestion whose source cannot be parsed and acknowledges it", async () => {
    const f = setup();
    const worker = f.run()!;
    expect(await worker.ready).toBe(true);
    const handler = f.consumer.registerJobHandler.mock.calls[0][1];
    const event = createJobEvent({
      type: JobType.INGESTION,
      source: "/services/api",
      data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
    });
    f.ingestions.process.mockResolvedValueOnce(
      processed(event.data.ingestionId, "pending", new TextEncoder().encode("not json\n")),
    );

    await expect(handler(event)).resolves.toBeUndefined();

    expect(f.ingestions.fail).toHaveBeenCalledExactlyOnceWith(
      event.data.ingestionId,
      "ingestion.parse_failed",
    );
    expect(f.ingestions.record).not.toHaveBeenCalled();
    await worker.shutdown();
  });

  it.each(["completed", "failed"] as const)(
    "acknowledges an already %s ingestion without further processing",
    async (status) => {
      const f = setup();
      const worker = f.run()!;
      expect(await worker.ready).toBe(true);
      const handler = f.consumer.registerJobHandler.mock.calls[0][1];
      const event = createJobEvent({
        type: JobType.INGESTION,
        source: "/services/api",
        data: { ingestionId: "11111111-1111-4111-8111-111111111111" },
      });
      f.ingestions.process.mockResolvedValueOnce(processed(event.data.ingestionId, status));

      await expect(handler(event)).resolves.toBeUndefined();

      expect(f.entries).toEqual([
        {
          level: "info",
          fields: { jobId: event.id, ingestionId: event.data.ingestionId, status },
          message: "ingestion already processed",
        },
      ]);
      expect(f.ingestions.fail).not.toHaveBeenCalled();
      expect(f.ingestions.record).not.toHaveBeenCalled();
      await worker.shutdown();
    },
  );

  it("propagates operational failures to the consumer without logging false completion or duplicate errors", async () => {
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
    expect(f.entries).toEqual([]);
    expect(f.log.error).not.toHaveBeenCalled();
    expect(f.ingestions.fail).not.toHaveBeenCalled();
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
