import { Kysely, sql } from "kysely";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("user")
    .addColumn("role", "text", (col) => col.defaultTo("user"))
    .addColumn("banned", "boolean", (col) => col.defaultTo(false))
    .addColumn("banReason", "text")
    .addColumn("banExpires", "timestamptz")
    .execute();

  await db.schema.alterTable("session").addColumn("impersonatedBy", "text").execute();

  await sql`update "user" set "role" = 'user' where "role" is null`.execute(db);
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("session").dropColumn("impersonatedBy").execute();

  await db.schema
    .alterTable("user")
    .dropColumn("banExpires")
    .dropColumn("banReason")
    .dropColumn("banned")
    .dropColumn("role")
    .execute();
}
