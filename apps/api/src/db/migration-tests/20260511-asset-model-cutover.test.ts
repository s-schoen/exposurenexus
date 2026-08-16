import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as cutover from "../migrations/20260511-asset-model-cutover.js";

describe("20260511 asset model cutover migration", () => {
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

  it("rejects populated legacy asset tables without changing their schema or data", async () => {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;
    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });

    await sql`
      create type "asset_type" as enum ('host', 'software', 'container')
    `.execute(db);
    await sql`
      create table "user_profile" (
        "id" uuid primary key
      )
    `.execute(db);
    await sql`
      create table "asset" (
        "id" uuid primary key,
        "name" text not null,
        "type" asset_type not null
      )
    `.execute(db);
    await sql`
      insert into "asset" ("id", "name", "type")
      values ('76b1885f-2d28-4b7d-93da-2751ff385aa3', 'legacy-host', 'host')
    `.execute(db);

    await expect(cutover.up(db)).rejects.toThrow(
      "asset model cutover does not backfill existing asset rows",
    );

    await expect(
      sql<{ column_name: string }>`
        select column_name
        from information_schema.columns
        where table_name = 'asset'
        order by ordinal_position asc
      `.execute(db),
    ).resolves.toMatchObject({
      rows: [{ column_name: "id" }, { column_name: "name" }, { column_name: "type" }],
    });
    await expect(
      sql<{ id: string; name: string; type: string }>`
        select id, name, type::text
        from "asset"
      `.execute(db),
    ).resolves.toMatchObject({
      rows: [
        {
          id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
          name: "legacy-host",
          type: "host",
        },
      ],
    });
    await expect(
      sql<{ typname: string }>`
        select typname
        from pg_type
        where typname in ('asset_environment', 'asset_lifecycle_state')
      `.execute(db),
    ).resolves.toMatchObject({ rows: [] });
  }, 15000);
});
