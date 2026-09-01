import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./index.js";
import type { Dialect } from "kysely";

export function createDatabase(dialect: Dialect): Kysely<Database> {
  return new Kysely<Database>({ dialect });
}

export function createPostgresPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
  });
}

export function createPostgresDatabase(connectionString: string): {
  database: Kysely<Database>;
  pool: Pool;
} {
  const pool = createPostgresPool(connectionString);
  const dialect = new PostgresDialect({ pool });

  return {
    database: createDatabase(dialect),
    pool,
  };
}
