import { EventEmitter } from "node:events";

import { beforeEach, expect, it, vi } from "vitest";

import type { Logger } from "pino";

const mocks = vi.hoisted(() => ({
  runApi: vi.fn(),
  createPostgresDatabase: vi.fn(),
  migrateToLatest: vi.fn().mockResolvedValue(undefined),
  createAppContainer: vi.fn(),
  createJobProducer: vi.fn(),
  createJobRepository: vi.fn(),
  createJobRelay: vi.fn(),
  serve: vi.fn(),
  logs: [] as string[],
}));

vi.mock("./lifecycle.js", () => ({ runApi: mocks.runApi }));
vi.mock("@exposurenexus/backend/database", () => mocks);
vi.mock("./container.js", () => mocks);
vi.mock("@exposurenexus/jobs/producer", () => mocks);
vi.mock("@exposurenexus/jobs/postgres", () => mocks);
vi.mock("@exposurenexus/jobs/relay", () => mocks);
vi.mock("@hono/node-server", () => mocks);
vi.mock("pino", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pino")>();
  return {
    ...actual,
    pino: (options: import("pino").LoggerOptions) =>
      actual.pino(options, {
        write: (line: string) => {
          mocks.logs.push(line);
        },
      }),
  };
});
vi.mock("./env.js", () => ({
  env: {
    LOG_LEVEL: "info",
    DATABASE_URL: "postgres://test",
    RABBITMQ_URL: "amqp://test",
    RABBITMQ_EXCHANGE: "jobs",
    STARTUP_TIMEOUT_MS: 30_000,
    SHUTDOWN_TIMEOUT_MS: 60_000,
    PORT: 3000,
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.logs.length = 0;
});

it("keeps credentials out of real Pino error fields and automatically generated messages", async () => {
  const error = new Error("connection failed: postgres://user:credential-secret@database/app");
  mocks.createPostgresDatabase.mockReturnValue({ database: {}, pool: new EventEmitter() });
  mocks.migrateToLatest.mockImplementationOnce(async (_database, logger: Logger) => {
    logger.error(error);
    logger.error({ err: error });
    logger.error({ err: error }, "failed to migrate");
    throw error;
  });
  await import("./index.js");
  const { dependencies } = mocks.runApi.mock.calls[0]![0] as Parameters<
    typeof import("./lifecycle.js").runApi
  >[0];
  await expect(dependencies.openDatabase().initialize()).rejects.toBe(error);
  expect(mocks.logs).toHaveLength(3);
  expect(mocks.logs.join("")).not.toContain("credential-secret");
  expect(mocks.logs.map((line) => JSON.parse(line).msg)).toEqual([
    "infrastructure error",
    "infrastructure error",
    "failed to migrate",
  ]);
});

it("wires migrations, admin, repository and relay to the application database and owns HTTP bind errors", async () => {
  const database = { destroy: vi.fn().mockResolvedValue(undefined) };
  const pool = new EventEmitter();
  const container = {
    createDefaultAdmin: vi.fn().mockResolvedValue(undefined),
    app: { fetch: vi.fn() },
  };
  const server = Object.assign(new EventEmitter(), {
    close: vi.fn((callback: (error?: NodeJS.ErrnoException) => void) => callback()),
  });
  mocks.createPostgresDatabase.mockReturnValue({ database, pool });
  mocks.createAppContainer.mockReturnValue(container);
  mocks.serve.mockReturnValue(server);
  const producer = { close: vi.fn(), publish: vi.fn() };
  mocks.createJobProducer.mockResolvedValue(producer);
  const repository = {};
  mocks.createJobRepository.mockReturnValue(repository);
  await import("./index.js");
  expect(mocks.runApi).toHaveBeenCalledOnce();
  const { dependencies, config } = mocks.runApi.mock.calls[0]![0] as Parameters<
    typeof import("./lifecycle.js").runApi
  >[0];
  expect(config).toEqual(
    expect.objectContaining({
      STARTUP_TIMEOUT_MS: 30_000,
      SHUTDOWN_TIMEOUT_MS: 60_000,
    }),
  );
  const db = dependencies.openDatabase();
  await db.initialize();
  expect(mocks.migrateToLatest).toHaveBeenCalledWith(database, expect.anything());
  expect(mocks.createAppContainer).toHaveBeenCalledWith(expect.objectContaining({ db: database }));
  expect(container.createDefaultAdmin).toHaveBeenCalledOnce();
  expect(mocks.migrateToLatest.mock.invocationCallOrder[0]).toBeLessThan(
    container.createDefaultAdmin.mock.invocationCallOrder[0]!,
  );
  await dependencies.openProducer();
  expect(mocks.createJobProducer).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionOptions: "amqp://test",
      exchangeName: "jobs",
      socketOptions: { timeout: 30_000 },
    }),
  );
  db.createRelay(producer);
  expect(mocks.createJobRepository).toHaveBeenCalledExactlyOnceWith(database);
  expect(mocks.createJobRelay).toHaveBeenCalledWith({
    repository,
    producer,
    logger: expect.anything(),
  });
  const onError = vi.fn();
  const http = db.openHttp(onError);
  queueMicrotask(() => server.emit("error", new Error("EADDRINUSE secret")));
  await expect(http.ready).rejects.toThrow("HTTP server failed");
  expect(onError).toHaveBeenCalledOnce();
  server.close.mockImplementation((callback) =>
    callback(
      Object.assign(new Error("not listening"), {
        code: "ERR_SERVER_NOT_RUNNING",
      }),
    ),
  );
  await http.close();
  expect(server.close).toHaveBeenCalledOnce();
  const listening = db.openHttp(vi.fn());
  mocks.serve.mock.calls[1]![1]({ port: 3000 });
  await expect(listening.ready).resolves.toBeUndefined();
  await listening.close();
  await db.close();
  expect(database.destroy).toHaveBeenCalledOnce();
});
