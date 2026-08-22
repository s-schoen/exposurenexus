import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as cutover from "../migrations/20260816-observation-model-cutover.js";

describe("20260816 observation model cutover migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<object> | null = null;

  async function startDatabase(): Promise<Kysely<object>> {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });
    return db;
  }

  async function createLegacyDomainTables(database: Kysely<object>): Promise<void> {
    await sql`
      create table "vulnerability" (
        "id" uuid primary key
      )
    `.execute(database);
    await sql`
      create table "finding" (
        "id" uuid primary key,
        "vulnerabilityId" uuid not null
      )
    `.execute(database);
    await sql`
      create table "vulnerability_source_mapping" (
        "id" uuid primary key
      )
    `.execute(database);
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

  it.each([
    [
      "finding",
      sql`insert into "finding" ("id", "vulnerabilityId") values ('2713d833-eb13-4517-ac7c-7761545ed42a', '76b1885f-2d28-4b7d-93da-2751ff385aa3')`,
    ],
    [
      "vulnerability",
      sql`insert into "vulnerability" ("id") values ('76b1885f-2d28-4b7d-93da-2751ff385aa3')`,
    ],
    [
      "source mapping",
      sql`insert into "vulnerability_source_mapping" ("id") values ('9d7acdd0-fad1-46c9-8218-1793f421f0fe')`,
    ],
  ])(
    "rejects populated legacy %s data before changing the schema",
    { timeout: 15_000 },
    async (name, insert) => {
      const database = await startDatabase();
      await createLegacyDomainTables(database);
      await insert.execute(database);

      await expect(cutover.up(database)).rejects.toThrow(
        "observation model cutover does not backfill existing finding or vulnerability data",
      );

      await expect(
        sql<{ column_name: string }>`
         select column_name
         from information_schema.columns
         where table_name = 'vulnerability'
         order by ordinal_position asc
       `.execute(database),
      ).resolves.toMatchObject({ rows: [{ column_name: "id" }] });
      await expect(
        sql`select 1 from ${sql.table(name === "source mapping" ? "vulnerability_source_mapping" : name)}`.execute(
          database,
        ),
      ).resolves.toMatchObject({ rows: [expect.anything()] });
    },
  );

  it(
    "rejects rollback without changing the observation-model schema",
    { timeout: 15_000 },
    async () => {
      const database = await startDatabase();
      await sql`
        create type "observation_source" as enum ('manual', 'nuclei')
      `.execute(database);
      await sql`
        create table "observation" (
          "id" uuid primary key
        )
      `.execute(database);

      await expect(cutover.down(database)).rejects.toThrow(
        "observation model cutover is irreversible",
      );

      await expect(
        sql<{ column_name: string }>`
          select column_name
          from information_schema.columns
          where table_name = 'observation'
          order by ordinal_position asc
        `.execute(database),
      ).resolves.toMatchObject({ rows: [{ column_name: "id" }] });
      await expect(
        sql<{ typname: string }>`
          select typname
          from pg_type
          where typname = 'observation_source'
        `.execute(database),
      ).resolves.toMatchObject({ rows: [{ typname: "observation_source" }] });
    },
  );
});
