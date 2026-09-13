import type { Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("import_source")
    .addColumn("ingestionId", "uuid", (col) =>
      col.unique().references("ingestion.id").onDelete("restrict"),
    )
    .execute();
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("import_source").dropColumn("ingestionId").execute();
}
