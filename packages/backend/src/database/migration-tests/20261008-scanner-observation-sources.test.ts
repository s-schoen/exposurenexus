import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as migration from "../migrations/20261008-scanner-observation-sources.js";

const manualObservationId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
const scannerObservationId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const ingestionId = "40b71ac1-b003-46b4-a1fc-8e8d384dd140";

describe("20261008 scanner observation sources migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<object> | null = null;

  async function startDatabase(): Promise<Kysely<object>> {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });
    await sql`create type observation_source as enum ('manual')`.execute(db);
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
    `.execute(db);
    await sql`
      insert into "observation" ("id", "source", "ingestionId")
      values (${manualObservationId}, 'manual', null)
    `.execute(db);
    return db;
  }

  async function observationSources(database: Kysely<object>): Promise<string[]> {
    const result = await sql<{ enumlabel: string }>`
      select pg_enum.enumlabel
      from pg_type
      join pg_enum on pg_enum.enumtypid = pg_type.oid
      where pg_type.typname = 'observation_source'
      order by pg_enum.enumsortorder asc
    `.execute(database);
    return result.rows.map((row) => row.enumlabel);
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
    "adds scanner sources, keeps manual observations, and still couples ingestion identity",
    { timeout: 15_000 },
    async () => {
      const database = await startDatabase();

      await migration.up(database);

      await expect(observationSources(database)).resolves.toEqual([
        "manual",
        "nuclei",
        "zap",
        "semgrep",
        "bearer",
        "checkov",
        "kics",
        "trivy",
      ]);
      await expect(
        sql`select "id", "source", "ingestionId" from "observation"`.execute(database),
      ).resolves.toMatchObject({
        rows: [{ id: manualObservationId, source: "manual", ingestionId: null }],
      });
      await sql`
        insert into "observation" ("id", "source", "ingestionId")
        values (${scannerObservationId}, 'trivy', ${ingestionId})
      `.execute(database);
      await expect(
        sql`
          insert into "observation" ("id", "source", "ingestionId")
          values (gen_random_uuid(), 'semgrep', null)
        `.execute(database),
      ).rejects.toThrow(/observation_source_ingestion_check/);
    },
  );

  it("restores the manual-only enum on rollback", { timeout: 15_000 }, async () => {
    const database = await startDatabase();

    await migration.up(database);
    await migration.down(database);

    await expect(observationSources(database)).resolves.toEqual(["manual"]);
    await expect(
      sql`select "id", "source" from "observation"`.execute(database),
    ).resolves.toMatchObject({ rows: [{ id: manualObservationId, source: "manual" }] });
  });

  it("rejects rollback while scanner observations exist", { timeout: 15_000 }, async () => {
    const database = await startDatabase();
    await migration.up(database);
    await sql`
        insert into "observation" ("id", "source", "ingestionId")
        values (${scannerObservationId}, 'nuclei', ${ingestionId})
      `.execute(database);

    await expect(migration.down(database)).rejects.toThrow(
      "removing scanner observation sources does not backfill existing scanner observations",
    );
    await expect(observationSources(database)).resolves.toContain("nuclei");
  });
});
