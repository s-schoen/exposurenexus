import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as migration from "../migrations/20260918-remove-nuclei-source.js";

describe("20260918 remove nuclei source migration", () => {
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

  async function createPreNucleiRemovalSchema(database: Kysely<object>): Promise<void> {
    await sql`create type observation_source as enum ('manual', 'nuclei')`.execute(database);
    await sql`create type ingestion_source as enum ('nuclei')`.execute(database);
    await sql`
      create table "ingestion" (
        "id" uuid primary key,
        "source" ingestion_source not null
      )
    `.execute(database);
    await sql`
      create table "import_source" (
        "id" uuid primary key,
        "source" ingestion_source
      )
    `.execute(database);
    await sql`
      create table "observation" (
        "id" uuid primary key,
        "source" observation_source not null,
        "ingestionId" uuid,
        constraint observation_source_ingestion_check check (
          ("source" = 'manual' and "ingestionId" is null)
          or
          ("source" <> 'manual' and "ingestionId" is not null)
        )
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

  it(
    "narrows the observation enum, drops the ingestion enum, and keeps source text",
    { timeout: 15_000 },
    async () => {
      const database = await startDatabase();
      await createPreNucleiRemovalSchema(database);

      await migration.up(database);

      await expect(
        sql<{ enumlabel: string }>`
          select pg_enum.enumlabel
          from pg_type
          join pg_enum on pg_enum.enumtypid = pg_type.oid
          where pg_type.typname = 'observation_source'
          order by pg_enum.enumsortorder asc
        `.execute(database),
      ).resolves.toMatchObject({ rows: [{ enumlabel: "manual" }] });
      await expect(
        sql`select 1 from pg_type where typname = 'ingestion_source'`.execute(database),
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        sql<{ table_name: string; column_name: string; data_type: string }>`
          select table_name, column_name, data_type
          from information_schema.columns
          where (table_name = 'ingestion' and column_name = 'source')
             or (table_name = 'import_source' and column_name = 'source')
          order by table_name asc
        `.execute(database),
      ).resolves.toMatchObject({
        rows: [
          { table_name: "import_source", column_name: "source", data_type: "text" },
          { table_name: "ingestion", column_name: "source", data_type: "text" },
        ],
      });
      await expect(
        sql<{ definition: string }>`
          select pg_get_constraintdef(pg_constraint.oid) as definition
          from pg_constraint
          join pg_class on pg_class.oid = pg_constraint.conrelid
          where pg_class.relname = 'observation'
            and pg_constraint.conname = 'observation_source_ingestion_check'
        `.execute(database),
      ).resolves.toMatchObject({
        rows: [{ definition: expect.stringContaining("source = 'manual'::observation_source") }],
      });
    },
  );

  it(
    "rejects existing nuclei observations before changing the schema",
    { timeout: 15_000 },
    async () => {
      const database = await startDatabase();
      await createPreNucleiRemovalSchema(database);
      await sql`
        insert into "observation" ("id", "source", "ingestionId")
        values ('2713d833-eb13-4517-ac7c-7761545ed42a', 'nuclei', gen_random_uuid())
      `.execute(database);

      await expect(migration.up(database)).rejects.toThrow(
        "removing the nuclei observation source does not backfill existing nuclei observations",
      );

      await expect(
        sql<{ enumlabel: string }>`
          select pg_enum.enumlabel
          from pg_type
          join pg_enum on pg_enum.enumtypid = pg_type.oid
          where pg_type.typname = 'observation_source'
          order by pg_enum.enumsortorder asc
        `.execute(database),
      ).resolves.toMatchObject({ rows: [{ enumlabel: "manual" }, { enumlabel: "nuclei" }] });
    },
  );

  it("preserves manual observations and restores the legacy enums on rollback", async () => {
    const database = await startDatabase();
    await createPreNucleiRemovalSchema(database);
    await sql`
      insert into "observation" ("id", "source", "ingestionId")
      values ('9d7acdd0-fad1-46c9-8218-1793f421f0fe', 'manual', null)
    `.execute(database);

    await migration.up(database);

    await expect(
      sql<{ id: string; source: string }>`
        select "id", "source" from "observation"
      `.execute(database),
    ).resolves.toMatchObject({
      rows: [{ id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe", source: "manual" }],
    });

    await migration.down(database);

    await expect(
      sql<{ enumlabel: string }>`
        select pg_enum.enumlabel
        from pg_type
        join pg_enum on pg_enum.enumtypid = pg_type.oid
        where pg_type.typname in ('observation_source', 'ingestion_source')
        order by pg_type.typname asc, pg_enum.enumsortorder asc
      `.execute(database),
    ).resolves.toMatchObject({
      rows: [{ enumlabel: "nuclei" }, { enumlabel: "manual" }, { enumlabel: "nuclei" }],
    });
  });
});
