import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import * as initBetterAuth from "../migrations/20251219-init-better-auth.js";
import * as betterAuthAdmin from "../migrations/20260414-better-auth-admin.js";
import * as roleDefault from "../migrations/20260418-rbac-role-default.js";

interface LegacyAuthMigrationDatabase {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
    username: string | null;
    displayUsername: string | null;
    role: string | null;
  };
}

describe("20260418 rbac role default migration", () => {
  let pgLite: PGlite | null = null;
  let db: Kysely<LegacyAuthMigrationDatabase> | null = null;

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

  it("backfills legacy user roles to viewer and updates the column default", async () => {
    pgLite = new PGlite("memory://");
    await pgLite.waitReady;

    db = new Kysely({
      dialect: new PGliteDialect({ pglite: pgLite }),
    });

    await initBetterAuth.up(db);
    await betterAuthAdmin.up(db);

    await db
      .insertInto("user")
      .values([
        {
          id: "user-null",
          name: "Null Role User",
          email: "null-role@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          username: "null-role",
          displayUsername: "Null Role",
          role: null,
        },
        {
          id: "user-legacy",
          name: "Legacy Role User",
          email: "legacy-role@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          username: "legacy-role",
          displayUsername: "Legacy Role",
          role: "user",
        },
        {
          id: "user-editor",
          name: "Editor Role User",
          email: "editor-role@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          username: "editor-role",
          displayUsername: "Editor Role",
          role: "editor",
        },
      ])
      .execute();

    await roleDefault.up(db);

    const users = await sql<{ id: string; role: string | null }>`
        select id, role
        from "user"
        where id in ('user-null', 'user-legacy', 'user-editor')
        order by id asc
      `.execute(db);
    const roleColumn = await sql<{ column_default: string | null }>`
        select column_default
        from information_schema.columns
        where table_name = 'user' and column_name = 'role'
      `.execute(db);

    expect(users.rows).toEqual([
      { id: "user-editor", role: "editor" },
      { id: "user-legacy", role: "viewer" },
      { id: "user-null", role: "viewer" },
    ]);
    expect(roleColumn.rows[0]?.column_default).toContain("viewer");
  }, 15000);
});
