import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { openWorkerDatabase } from "./database.js";
import { deferred } from "./test/deferred.js";

import type { BackendRuntime } from "@exposurenexus/backend";
import type { Logger } from "pino";

function setup() {
  const pool = Object.assign(new EventEmitter(), { query: vi.fn(async (_sql: string) => {}) });
  const database = { destroy: vi.fn(async () => {}) };
  const logger = { error: vi.fn() };
  const runtime = {} as BackendRuntime;
  const factories = {
    createPostgresDatabase: vi.fn(() => ({ database, pool })),
    checkDatabaseMigrations: vi.fn(async (_database: typeof database) => {}),
    createBackendRuntime: vi.fn(() => runtime),
  };
  const adapter = openWorkerDatabase(
    "postgres://user:secret@localhost/db",
    logger as unknown as Logger,
    factories,
  );
  return { pool, database, logger, runtime, factories, adapter };
}

describe("worker database adapter", () => {
  it("awaits connectivity before checking migrations, constructs runtime, and destroys only the database", async () => {
    const f = setup();
    const checking = deferred();
    f.pool.query.mockReturnValueOnce(checking.promise);
    const checked = f.adapter.check();
    expect(f.factories.createPostgresDatabase).toHaveBeenCalledExactlyOnceWith(
      "postgres://user:secret@localhost/db",
    );
    expect(f.pool.query).toHaveBeenCalledExactlyOnceWith("select 1");
    expect(f.factories.checkDatabaseMigrations).not.toHaveBeenCalled();
    checking.resolve();
    await checked;
    expect(f.factories.checkDatabaseMigrations).toHaveBeenCalledExactlyOnceWith(f.database);
    expect(f.adapter.createRuntime()).toBe(f.runtime);
    expect(f.factories.createBackendRuntime).toHaveBeenCalledExactlyOnceWith({
      database: f.database,
      logger: f.logger,
    });
    await f.adapter.close();
    expect(f.database.destroy).toHaveBeenCalledOnce();
  });

  it("logs background pool errors without transport secrets", () => {
    const f = setup();
    f.pool.emit("error", new Error("postgres://user:secret@host"));
    expect(f.logger.error).toHaveBeenCalledExactlyOnceWith("worker database connection error");
  });

  it("skips migrations when connectivity fails", async () => {
    const f = setup();
    const error = new Error("connection failed");
    f.pool.query.mockRejectedValueOnce(error);
    await expect(f.adapter.check()).rejects.toBe(error);
    expect(f.factories.checkDatabaseMigrations).not.toHaveBeenCalled();
  });

  it("replaces migration errors with a safe actionable hint", async () => {
    const f = setup();
    f.factories.checkDatabaseMigrations.mockRejectedValueOnce(new Error("secret"));
    await expect(f.adapter.check()).rejects.toThrow(
      "Worker database migration verification failed",
    );
    expect(f.logger.error).toHaveBeenCalledExactlyOnceWith(
      "worker migration verification failed; ensure API migrations have completed",
    );
  });
});
