import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema
    .createType("ingestion_status")
    .asEnum(["pending", "completed", "failed"])
    .execute();
  // Existing ingestions have not been processed, so they all start as pending.
  await db.schema
    .alterTable("ingestion")
    .addColumn("status", sql`ingestion_status`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("processedAt", "timestamptz")
    .addColumn("failureCode", "text")
    .execute();
  await sql`
    alter table ingestion
      add constraint ingestion_processing_state_check
      check (
        ("status" = 'failed') = ("failureCode" is not null)
        and ("status" <> 'pending') = ("processedAt" is not null)
      )
  `.execute(db);
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("ingestion")
    .dropColumn("failureCode")
    .dropColumn("processedAt")
    .dropColumn("status")
    .execute();
  await db.schema.dropType("ingestion_status").execute();
}
