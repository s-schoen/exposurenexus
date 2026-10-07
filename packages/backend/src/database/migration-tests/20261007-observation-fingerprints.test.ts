import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as migration from "../migrations/20261007-observation-fingerprints.js";

describe("20261007 observation fingerprints migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<object> | null = null;

  async function startDatabase(): Promise<Kysely<object>> {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });
    await sql`create table "observation" ("id" uuid primary key)`.execute(db);
    return db;
  }

  afterEach(async () => {
    if (db) {
      await db.destroy();
      db = null;
    }

    if (pgLite && !pgLite.closed) {
      await pgLite.close();
      pgLite = null;
    }
  });

  it(
    "backfills existing observations with empty fingerprints and requires explicit writes",
    { timeout: 15_000 },
    async () => {
      const database = await startDatabase();
      await sql`
        insert into "observation" ("id") values ('2713d833-eb13-4517-ac7c-7761545ed42a')
      `.execute(database);

      await migration.up(database);

      await expect(
        sql`select "fingerprints" from "observation"`.execute(database),
      ).resolves.toMatchObject({ rows: [{ fingerprints: {} }] });
      await expect(
        sql<{ is_nullable: string; column_default: string | null }>`
          select is_nullable, column_default
          from information_schema.columns
          where table_name = 'observation' and column_name = 'fingerprints'
        `.execute(database),
      ).resolves.toMatchObject({ rows: [{ is_nullable: "NO", column_default: null }] });
      await expect(
        sql`insert into "observation" ("id") values (gen_random_uuid())`.execute(database),
      ).rejects.toThrow();
      await expect(
        sql`
          insert into "observation" ("id", "fingerprints") values (gen_random_uuid(), '[]'::jsonb)
        `.execute(database),
      ).rejects.toThrow();
    },
  );

  it("drops the fingerprints column on rollback", { timeout: 15_000 }, async () => {
    const database = await startDatabase();
    await migration.up(database);

    await migration.down(database);

    await expect(
      sql`
        select 1 from information_schema.columns
        where table_name = 'observation' and column_name = 'fingerprints'
      `.execute(database),
    ).resolves.toMatchObject({ rows: [] });
  });
});
