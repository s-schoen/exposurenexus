import { EventEmitter } from "node:events";

import { beforeEach, expect, it, vi } from "vitest";

import { bootstrapApi } from "./bootstrap.js";

const mocks = vi.hoisted(() => ({
  createPostgresDatabase: vi.fn(),
  migrateToLatest: vi.fn(),
  createAppContainer: vi.fn(),
  createJobProducer: vi.fn(),
  createJobRepository: vi.fn(),
  createJobRelay: vi.fn(),
  serve: vi.fn(),
}));

vi.mock("@exposurenexus/backend/database", () => mocks);
vi.mock("./container.js", () => mocks);
vi.mock("@exposurenexus/jobs/producer", () => mocks);
vi.mock("@exposurenexus/jobs/postgres", () => mocks);
vi.mock("@exposurenexus/jobs/relay", () => mocks);
vi.mock("@hono/node-server", () => mocks);
vi.mock("./env.js", () => ({ env: { LOG_LEVEL: "silent" } }));

const config = {
  PORT: 3000,
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://test",
  RABBITMQ_URL: "amqp://test",
  RABBITMQ_EXCHANGE: "jobs",
  STARTUP_TIMEOUT_MS: 30_000,
  SHUTDOWN_TIMEOUT_MS: 60_000,
  APP_ORIGIN: "https://app.example.test",
  STATIC_DIR: "public",
  AUTH_SESSION_LIFETIME: 12,
  AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
  AUTH_COOKIE_SECURE: true,
  AUTH_TRUSTED_PROXIES: ["127.0.0.1"],
  API_TIMEOUT_MS: 5000,
  CORS_ORIGIN: undefined,
};

beforeEach(() => vi.resetAllMocks());

function fixture() {
  const database = { destroy: vi.fn().mockResolvedValue(undefined) };
  const pool = new EventEmitter();
  const container = {
    createDefaultAdmin: vi.fn().mockResolvedValue(undefined),
    app: { fetch: vi.fn() },
  };
  const producer = { publish: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
  const relay = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {};
  const server = Object.assign(new EventEmitter(), {
    close: vi.fn((callback: (error?: NodeJS.ErrnoException) => void) => callback()),
  });
  mocks.createPostgresDatabase.mockReturnValue({ database, pool });
  mocks.migrateToLatest.mockResolvedValue(undefined);
  mocks.createAppContainer.mockReturnValue(container);
  mocks.createJobProducer.mockResolvedValue(producer);
  mocks.createJobRepository.mockReturnValue(repository);
  mocks.createJobRelay.mockReturnValue(relay);
  mocks.serve.mockReturnValue(server);
  const signals = new EventEmitter();
  const exit = vi.fn();
  const start = () => bootstrapApi(config, { signals, exit });
  return { database, pool, container, producer, relay, repository, server, signals, exit, start };
}

it("wires the initialized application and relay to one database before reporting HTTP readiness", async () => {
  const f = fixture();
  const api = f.start();
  expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
  expect(f.signals.listenerCount("SIGTERM")).toBe(1);
  await vi.waitFor(() => expect(mocks.serve).toHaveBeenCalledOnce());
  expect(mocks.createPostgresDatabase).toHaveBeenCalledExactlyOnceWith(config.DATABASE_URL);
  expect(mocks.migrateToLatest).toHaveBeenCalledExactlyOnceWith(f.database, expect.anything());
  expect(mocks.createAppContainer).toHaveBeenCalledExactlyOnceWith({
    db: f.database,
    appOrigin: config.APP_ORIGIN,
    staticDir: config.STATIC_DIR,
    authSessionLifetimeHours: config.AUTH_SESSION_LIFETIME,
    authSessionHmacSecret: config.AUTH_SECRET,
    authCookieSecure: config.AUTH_COOKIE_SECURE,
    authTrustedProxies: config.AUTH_TRUSTED_PROXIES,
    apiTimeoutMs: config.API_TIMEOUT_MS,
    logger: expect.anything(),
    accessLogger: expect.anything(),
    dbLogger: mocks.migrateToLatest.mock.calls[0]![1],
    loggerFactory: expect.any(Function),
  });
  expect(mocks.createJobProducer).toHaveBeenCalledExactlyOnceWith({
    connectionOptions: config.RABBITMQ_URL,
    exchangeName: config.RABBITMQ_EXCHANGE,
    socketOptions: { timeout: config.STARTUP_TIMEOUT_MS },
    logger: expect.anything(),
  });
  expect(mocks.createJobRepository).toHaveBeenCalledExactlyOnceWith(f.database);
  expect(mocks.createJobRelay).toHaveBeenCalledExactlyOnceWith({
    repository: f.repository,
    producer: f.producer,
    logger: mocks.createJobProducer.mock.calls[0]![0].logger,
  });
  const startupCalls = [
    mocks.migrateToLatest,
    mocks.createAppContainer,
    f.container.createDefaultAdmin,
    mocks.createJobProducer,
    f.relay.start,
    mocks.serve,
  ].map((fn) => fn.mock.invocationCallOrder[0]!);
  for (let index = 1; index < startupCalls.length; index++) {
    expect(startupCalls[index - 1]).toBeLessThan(startupCalls[index]!);
  }
  expect(mocks.serve).toHaveBeenCalledWith(
    { fetch: f.container.app.fetch, port: config.PORT },
    expect.any(Function),
  );
  const ready = vi.fn();
  void api.ready.then(ready);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  mocks.serve.mock.calls[0]![1]({ port: config.PORT });
  expect(await api.ready).toBe(true);
  f.pool.emit("error", new Error("database connection error"));
  f.signals.emit("SIGTERM");
  await api.stopped;
  expect(f.server.close).toHaveBeenCalledOnce();
  expect(f.relay.stop).toHaveBeenCalledOnce();
  expect(f.producer.close).toHaveBeenCalledOnce();
  expect(f.database.destroy).toHaveBeenCalledOnce();
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it("installs supervision before acquisition so an immediate signal opens no resources", async () => {
  const f = fixture();
  const api = f.start();
  f.signals.emit("SIGINT");
  await api.stopped;
  expect(await api.ready).toBe(false);
  expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
  expect(mocks.createJobProducer).not.toHaveBeenCalled();
  expect(mocks.serve).not.toHaveBeenCalled();
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it.each(["migrations", "composition", "default admin"])(
  "closes the acquired database after %s failure without starting broker or HTTP work",
  async (stage) => {
    const f = fixture();
    const error = new Error("initialization failed");
    if (stage === "migrations") mocks.migrateToLatest.mockRejectedValue(error);
    if (stage === "composition")
      mocks.createAppContainer.mockImplementation(() => {
        throw error;
      });
    if (stage === "default admin") f.container.createDefaultAdmin.mockRejectedValue(error);
    const api = f.start();
    expect(await api.ready).toBe(false);
    await api.stopped;
    expect(f.database.destroy).toHaveBeenCalledOnce();
    expect(mocks.createJobProducer).not.toHaveBeenCalled();
    expect(mocks.serve).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  },
);

it("owns the HTTP server and other resources when binding fails", async () => {
  const f = fixture();
  const api = f.start();
  await vi.waitFor(() => expect(mocks.serve).toHaveBeenCalledOnce());
  f.server.emit("error", new Error("EADDRINUSE"));
  expect(await api.ready).toBe(false);
  await api.stopped;
  expect(f.server.close).toHaveBeenCalledOnce();
  expect(f.relay.stop).toHaveBeenCalledOnce();
  expect(f.producer.close).toHaveBeenCalledOnce();
  expect(f.database.destroy).toHaveBeenCalledOnce();
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
});
