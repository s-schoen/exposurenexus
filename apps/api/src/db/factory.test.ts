import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Pool } from "pg";

const { poolMock, postgresDialectMock, kyselyMock, createLoggerMock } = vi.hoisted(() => ({
  poolMock: vi.fn(),
  postgresDialectMock: vi.fn(),
  kyselyMock: vi.fn(),
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
    const pool = { end: vi.fn() };

    poolMock.mockReturnValue(pool);

    expect(createPool("postgres://test-db")).toBe(pool);
    expect(poolMock).toHaveBeenCalledWith({
      connectionString: "postgres://test-db",
      max: 10,
    });
  });

  it("creates a Kysely db around a postgres dialect", () => {
    const pool = { end: vi.fn() } as unknown as Pool;
    const dialect = { dialect: true };
    const db = { selectFrom: vi.fn() };

    postgresDialectMock.mockReturnValue(dialect);
    kyselyMock.mockReturnValue(db);

    expect(createDb(pool)).toBe(db);
    expect(postgresDialectMock).toHaveBeenCalledWith({ pool });
    expect(kyselyMock).toHaveBeenCalledWith({ dialect });
  });

  it("creates the production database bundle", () => {
    const pool = { end: vi.fn() } as unknown as Pool;
    const db = { selectFrom: vi.fn() };
    const logger = { info: vi.fn(), error: vi.fn() };

    poolMock.mockReturnValue(pool);
    postgresDialectMock.mockReturnValue({ dialect: true });
    kyselyMock.mockReturnValue(db);
    createLoggerMock.mockReturnValue(logger);

    expect(createDatabase("postgres://test-db")).toEqual({
      pool,
      db,
      logger,
    });
    expect(createLoggerMock).toHaveBeenCalledWith("db");
  });
});
