import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as KyselyModule from "kysely";

const { poolMock, postgresDialectMock, kyselyMock } = vi.hoisted(() => ({
  poolMock: vi.fn(
    class PoolMock {
      end = vi.fn();
    },
  ),
  postgresDialectMock: vi.fn(class PostgresDialectMock {}),
  kyselyMock: vi.fn(class KyselyMock {}),
}));

vi.mock("pg", () => ({
  Pool: poolMock,
}));

vi.mock("kysely", async () => {
  const actual = await vi.importActual<typeof KyselyModule>("kysely");

  return {
    ...actual,
    PostgresDialect: postgresDialectMock,
    Kysely: kyselyMock,
  };
});

import { createDatabase, createPostgresDatabase, createPostgresPool } from "./factory.js";

describe("database factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a PostgreSQL pool from a connection string", () => {
    const pool = createPostgresPool("postgres://test-db");

    expect(pool).toBe(poolMock.mock.instances[0]);
    expect(poolMock).toHaveBeenCalledWith({
      connectionString: "postgres://test-db",
      max: 10,
    });
  });

  it("creates a typed database around an explicit dialect", () => {
    const dialect = {};

    const database = createDatabase(dialect as never);

    expect(database).toBe(kyselyMock.mock.instances[0]);
    expect(kyselyMock).toHaveBeenCalledWith({ dialect });
  });

  it("creates the production PostgreSQL database bundle", () => {
    const result = createPostgresDatabase("postgres://test-db");
    const pool = poolMock.mock.instances[0];
    const dialect = postgresDialectMock.mock.instances[0];
    const database = kyselyMock.mock.instances[0];

    expect(result).toEqual({
      database,
      pool,
    });
    expect(postgresDialectMock).toHaveBeenCalledWith({ pool });
    expect(kyselyMock).toHaveBeenCalledWith({ dialect });
  });
});
