import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createDatabase, migrateToLatest } from "@exposurenexus/backend/database";
import { PGliteDialect, sql } from "kysely";

import type { Database } from "@exposurenexus/backend/database";
import type { Kysely } from "kysely";

export interface TestDatabase {
  db: Kysely<Database>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

/** Creates an in-memory Postgres (PGlite) database migrated to the latest schema. */
export function createTestDatabase(): TestDatabase {
  let pgLite: PGlite | null = null;
  let db: Kysely<Database> | null = null;

  return {
    get db(): Kysely<Database> {
      if (!db) {
        throw new Error("test database has not been started");
      }
      return db;
    },

    async start(): Promise<void> {
      pgLite = new PGlite("memory://", { extensions: { pgcrypto } });
      await pgLite.waitReady;

      db = createDatabase(new PGliteDialect({ pglite: pgLite }));
      await db.executeQuery(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.compile(db));
      await migrateToLatest(db, { info: () => {}, error: () => {} } as never);
    },

    async dispose(): Promise<void> {
      if (db) {
        await db.destroy();
      }
      if (pgLite && !pgLite.closed) {
        await pgLite.close();
      }
    },
  };
}
