import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  // The temporary default backfills existing observations with an empty record.
  await db.schema
    .alterTable("observation")
    .addColumn("fingerprints", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();
  await db.schema
    .alterTable("observation")
    .alterColumn("fingerprints", (col) => col.dropDefault())
    .execute();
  await sql`
    alter table observation
      add constraint observation_fingerprints_object_check
      check (jsonb_typeof("fingerprints") = 'object')
  `.execute(db);
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("observation").dropColumn("fingerprints").execute();
}
