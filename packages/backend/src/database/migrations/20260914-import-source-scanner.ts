import { sql } from "kysely";

import type { Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("import_source")
    .addColumn("source", sql`ingestion_source`)
    .execute();
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("import_source").dropColumn("source").execute();
}
