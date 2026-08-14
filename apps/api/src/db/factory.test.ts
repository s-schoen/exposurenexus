import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Pool } from "pg";

const { poolMock, postgresDialectMock, kyselyMock, createLoggerMock } = vi.hoisted(() => ({
  poolMock: vi.fn(
    class PoolMock {
      end = vi.fn();
    },
  ),
  postgresDialectMock: vi.fn(class PostgresDialectMock {}),
  kyselyMock: vi.fn(class KyselyMock {}),
  createLoggerMock: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
}));

vi.mock("pg", () => ({
  Pool: poolMock,
}));

vi.mock("kysely", async () => {
  const actual = await vi.importActual<typeof import("kysely")>("kysely");

  return {
    ...actual,
    PostgresDialect: postgresDialectMock,
    Kysely: kyselyMock,
  };
});

vi.mock("../logging.js", () => ({
  createLogger: createLoggerMock,
}));

import { createDatabase, createDb, createPool } from "./factory.js";

describe("db factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pg pool from a connection string", () => {
    const pool = createPool("postgres://test-db");

    expect(pool).toBe(poolMock.mock.instances[0]);
    expect(poolMock).toHaveBeenCalledWith({
      connectionString: "postgres://test-db",
      max: 10,
    });
  });

  it("creates a Kysely db around a postgres dialect", () => {
    const pool = { end: vi.fn() } as unknown as Pool;

    const db = createDb(pool);
    const dialect = postgresDialectMock.mock.instances[0];

    expect(db).toBe(kyselyMock.mock.instances[0]);
    expect(postgresDialectMock).toHaveBeenCalledWith({ pool });
    expect(kyselyMock).toHaveBeenCalledWith({ dialect });
  });

  it("creates the production database bundle", () => {
    const logger = { info: vi.fn(), error: vi.fn() };

    createLoggerMock.mockReturnValue(logger);
    const database = createDatabase("postgres://test-db");
    const pool = poolMock.mock.instances[0];
    const db = kyselyMock.mock.instances[0];

    expect(database).toEqual({
      pool,
      db,
      logger,
    });
    expect(createLoggerMock).toHaveBeenCalledWith("db");
  });
});
