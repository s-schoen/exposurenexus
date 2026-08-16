import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as cutover from "../migrations/20260816-observation-model-cutover.js";

describe("20260816 observation model cutover migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<object> | null = null;

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

  it("rejects populated legacy finding data before changing the schema", async () => {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });

    await sql`
      create table "vulnerability" (
        "id" uuid primary key
      )
    `.execute(db);
    await sql`
      create table "finding" (
        "id" uuid primary key,
        "vulnerabilityId" uuid not null
      )
    `.execute(db);
    await sql`
      create table "vulnerability_source_mapping" (
        "id" uuid primary key
      )
    `.execute(db);
    await sql`
      insert into "vulnerability" ("id")
      values ('76b1885f-2d28-4b7d-93da-2751ff385aa3')
    `.execute(db);

    await expect(cutover.up(db)).rejects.toThrow(
      "observation model cutover does not backfill existing finding or vulnerability data",
    );

    await expect(
      sql<{ column_name: string }>`
        select column_name
        from information_schema.columns
        where table_name = 'vulnerability'
        order by ordinal_position asc
      `.execute(db),
    ).resolves.toMatchObject({ rows: [{ column_name: "id" }] });
    await expect(
      sql<{ id: string }>`
        select id
        from "vulnerability"
      `.execute(db),
    ).resolves.toMatchObject({
      rows: [{ id: "76b1885f-2d28-4b7d-93da-2751ff385aa3" }],
    });
  });
});
