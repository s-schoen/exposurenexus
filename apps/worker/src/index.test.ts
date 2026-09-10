import { createBackendRuntime } from "@exposurenexus/backend";
import { checkDatabaseMigrations, createPostgresDatabase } from "@exposurenexus/backend/database";
import { createJobConsumer } from "@exposurenexus/jobs/consumer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWorker } from "./worker.js";

const f = vi.hoisted(() => ({
  pool: { query: vi.fn(), on: vi.fn() },
  database: { destroy: vi.fn() },
  logger: { error: vi.fn(), fatal: vi.fn() },
  exit: vi.fn(),
}));

vi.mock("@exposurenexus/backend", () => ({ createBackendRuntime: vi.fn() }));
vi.mock("@exposurenexus/backend/database", () => ({
  checkDatabaseMigrations: vi.fn(),
  createPostgresDatabase: vi.fn(() => ({ database: f.database, pool: f.pool })),
}));
vi.mock("@exposurenexus/jobs/consumer", () => ({ createJobConsumer: vi.fn() }));
vi.mock("./logging.js", () => ({ createLogger: vi.fn(() => f.logger) }));
vi.mock("./worker.js", () => ({ runWorker: vi.fn() }));

describe("worker executable composition", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://user:secret@localhost/db");
    vi.stubEnv("RABBITMQ_URL", "amqp://worker:secret@localhost");
    vi.stubEnv("RABBITMQ_QUEUE", "worker-queue");
    vi.stubEnv("AUTH_SECRET", "invalid-but-irrelevant");
    vi.spyOn(process, "exit").mockImplementation((code) => {
      f.exit(code);
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("composes only shared boundaries and an empty production handler set", async () => {
    await import("./index.js");
    const [config, logger, dependencies] = vi.mocked(runWorker).mock.calls[0];
    expect(logger).toBe(f.logger);
    expect(dependencies.signals).toBe(process);
    const database = dependencies.openDatabase();
    expect(createPostgresDatabase).toHaveBeenCalledWith(config.DATABASE_URL);
    await database.check();
    expect(f.pool.query).toHaveBeenCalledExactlyOnceWith("select 1");
    expect(checkDatabaseMigrations).toHaveBeenCalledExactlyOnceWith(f.database);
    expect(f.pool.query.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(checkDatabaseMigrations).mock.invocationCallOrder[0],
    );
    const runtime = database.createRuntime();
    expect(createBackendRuntime).toHaveBeenCalledExactlyOnceWith({ database: f.database, logger });
    expect(dependencies.createHandlers(runtime)).toEqual({});
    await dependencies.openConsumer();
    expect(createJobConsumer).toHaveBeenCalledExactlyOnceWith({
      connectionOptions: config.RABBITMQ_URL,
      queueName: "worker-queue",
      socketOptions: { timeout: config.STARTUP_TIMEOUT_MS },
      logger,
    });
    await database.close();
    expect(f.database.destroy).toHaveBeenCalledOnce();
    dependencies.exit(1);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("handles pool background errors without logging transport secrets", async () => {
    await import("./index.js");
    vi.mocked(runWorker).mock.calls[0][2].openDatabase();
    const [event, listener] = f.pool.on.mock.calls[0] as [string, (error: Error) => void];
    expect(event).toBe("error");
    listener(new Error("postgres://user:secret@localhost"));
    expect(f.logger.error).toHaveBeenCalledExactlyOnceWith("worker database connection error");
  });

  it("does not check migrations when database connectivity fails", async () => {
    f.pool.query.mockRejectedValueOnce(new Error("database unavailable"));
    await import("./index.js");
    const database = vi.mocked(runWorker).mock.calls[0][2].openDatabase();
    await expect(database.check()).rejects.toThrow("database unavailable");
    expect(checkDatabaseMigrations).not.toHaveBeenCalled();
  });

  it("reports migration verification failure with a safe actionable hint", async () => {
    vi.mocked(checkDatabaseMigrations).mockRejectedValueOnce(new Error("secret"));
    await import("./index.js");
    const database = vi.mocked(runWorker).mock.calls[0][2].openDatabase();
    await expect(database.check()).rejects.toThrow("Worker database migration verification failed");
    expect(f.logger.error).toHaveBeenCalledExactlyOnceWith(
      "worker migration verification failed; ensure API migrations have completed",
    );
  });

  it("fails configuration before acquiring resources without logging rejected input", async () => {
    vi.stubEnv("DATABASE_URL", "not-a-url-with-secret");
    await import("./index.js");
    expect(runWorker).not.toHaveBeenCalled();
    expect(createPostgresDatabase).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(JSON.stringify(f.logger.fatal.mock.calls)).not.toContain("not-a-url-with-secret");
    expect(f.logger.fatal).toHaveBeenCalledExactlyOnceWith(
      "Invalid worker configuration: DATABASE_URL",
    );
  });

  it("does not log arbitrary bootstrap errors even when their messages resemble validation errors", async () => {
    vi.mocked(runWorker).mockImplementationOnce(() => {
      throw new Error("Invalid worker configuration: amqp://user:secret@host");
    });
    await import("./index.js");
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(f.logger.fatal).toHaveBeenCalledExactlyOnceWith(
      "worker configuration or bootstrap failed; check required worker settings",
    );
    expect(JSON.stringify(f.logger.fatal.mock.calls)).not.toContain("secret");
  });

  it("reports missing required and invalid optional configuration field names together", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("RABBITMQ_URL", "");
    vi.stubEnv("LOG_LEVEL", "secret-invalid-level");
    await import("./index.js");
    expect(f.logger.fatal).toHaveBeenCalledExactlyOnceWith(
      "Invalid worker configuration: DATABASE_URL, RABBITMQ_URL, LOG_LEVEL",
    );
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(runWorker).not.toHaveBeenCalled();
  });
});
