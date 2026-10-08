import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as migration from "../migrations/20261009-ingestion-processing-state.js";

const ingestionId = "40b71ac1-b003-46b4-a1fc-8e8d384dd140";

describe("20261009 ingestion processing state migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<object> | null = null;

  async function startDatabase(): Promise<Kysely<object>> {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });
    await sql`
      create table "ingestion" (
        "id" uuid primary key,
        "source" text not null,
        "createdAt" timestamptz not null
      )
    `.execute(db);
    await sql`
      insert into "ingestion" ("id", "source", "createdAt")
      values (${ingestionId}, 'nuclei', '2026-10-01T00:00:00Z')
    `.execute(db);
    return db;
  }

  async function ingestionColumns(database: Kysely<object>): Promise<string[]> {
    const result = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'ingestion' order by ordinal_position
    `.execute(database);
    return result.rows.map((row) => row.column_name);
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

  it("marks existing ingestions as pending and unprocessed", { timeout: 15_000 }, async () => {
    const database = await startDatabase();

    await migration.up(database);

    await expect(
      sql`select "id", "status", "processedAt", "failureCode" from "ingestion"`.execute(database),
    ).resolves.toMatchObject({
      rows: [{ id: ingestionId, status: "pending", processedAt: null, failureCode: null }],
    });
  });

  it("restores the original ingestion columns on rollback", { timeout: 15_000 }, async () => {
    const database = await startDatabase();

    await migration.up(database);
    await sql`
      update "ingestion"
      set "status" = 'failed', "processedAt" = now(), "failureCode" = 'ingestion.parse_failed'
    `.execute(database);
    await migration.down(database);

    await expect(ingestionColumns(database)).resolves.toEqual(["id", "source", "createdAt"]);
    await expect(
      sql`select 1 from pg_type where typname = 'ingestion_status'`.execute(database),
    ).resolves.toMatchObject({ rows: [] });
  });
});
