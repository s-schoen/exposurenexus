import { PGlite } from "@electric-sql/pglite";
import { PGliteDialect, sql } from "kysely";
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkDatabaseMigrations, createDatabase, migrateToLatest } from "./index.js";
import { createMigrationProvider } from "./migration.js";

import type { Database } from "./index.js";
import type { Kysely } from "kysely";

describe("database migration status", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    const pglite = new PGlite();
    database = createDatabase(new PGliteDialect({ pglite }));
    await pglite.waitReady;
  });

  afterEach(async () => {
    await database.destroy();
  });

  it("rejects missing history without creating migration tables", async () => {
    await sql`set default_transaction_read_only = on`.execute(database);

    await expect(checkDatabaseMigrations(database)).rejects.toThrow(
      /Database migrations are missing.*20251219-init-better-auth/,
    );
    expect(await database.introspection.getTables()).toEqual([]);
  });

  it("rejects empty migration history", async () => {
    await migrateToLatest(database, pino({ enabled: false }));
    await sql`delete from kysely_migration`.execute(database);
    await sql`set default_transaction_read_only = on`.execute(database);

    await expect(checkDatabaseMigrations(database)).rejects.toThrow(
      /Database migrations are missing.*Run the API migrations before starting the worker/,
    );
  });

  it("rejects an unapplied earlier migration even when the latest is applied", async () => {
    await migrateToLatest(database, pino({ enabled: false }));
    const names = Object.keys(await createMigrationProvider().getMigrations()).sort();
    const missing = names[1]!;
    await sql`delete from kysely_migration where name = ${missing}`.execute(database);
    const before = await sql`select * from kysely_migration order by name`.execute(database);
    await sql`set default_transaction_read_only = on`.execute(database);

    await expect(checkDatabaseMigrations(database)).rejects.toThrow(
      `Database migrations are missing: ${missing}.`,
    );
    expect(
      (await sql`select * from kysely_migration order by name`.execute(database)).rows,
    ).toEqual(before.rows);
  });

  it("accepts fully applied migrations using a read-only connection without changing history", async () => {
    await migrateToLatest(database, pino({ enabled: false }));
    const before = await sql`select * from kysely_migration order by name`.execute(database);
    await sql`set default_transaction_read_only = on`.execute(database);

    await expect(checkDatabaseMigrations(database)).resolves.toBeUndefined();
    expect(
      (await sql`select * from kysely_migration order by name`.execute(database)).rows,
    ).toEqual(before.rows);
    await expect(sql`delete from kysely_migration`.execute(database)).rejects.toThrow(/read-only/);
  });
});
