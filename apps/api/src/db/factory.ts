import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { createLogger } from "../logging.js";

import type { Database } from "./index.js";

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 10,
  });
}

export function createDb(pool: Pool) {
  const dialect = new PostgresDialect({
    pool,
  });

  return new Kysely<Database>({ dialect });
}

export function createDatabase(connectionString: string) {
  const logger = createLogger("db");
  const pool = createPool(connectionString);
  const db = createDb(pool);

  return {
    logger,
    pool,
    db,
  };
}
