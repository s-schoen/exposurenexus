import { type Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("finding").addColumn("dueDate", "timestamptz").execute();
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("finding").dropColumn("dueDate").execute();
}
