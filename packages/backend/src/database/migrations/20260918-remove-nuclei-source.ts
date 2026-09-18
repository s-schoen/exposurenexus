import { sql, type Kysely } from "kysely";

async function assertNoNucleiObservations(db: Kysely<object>): Promise<void> {
  const result = await sql<{ count: number }>`
    select count(*)::int as count
    from observation
    where source = 'nuclei'
  `.execute(db);

  if ((result.rows[0]?.count ?? 0) > 0) {
    throw new Error(
      "removing the nuclei observation source does not backfill existing nuclei observations",
    );
  }
}

export async function up(db: Kysely<object>): Promise<void> {
  await assertNoNucleiObservations(db);

  await sql`alter table observation drop constraint observation_source_ingestion_check`.execute(db);
  await sql`alter type observation_source rename to observation_source_nuclei`.execute(db);
  await sql`create type observation_source as enum ('manual')`.execute(db);
  await sql`alter table observation alter column source type observation_source using source::text::observation_source`.execute(
    db,
  );
  await sql`drop type observation_source_nuclei`.execute(db);
  await sql`
    alter table observation add constraint observation_source_ingestion_check
      check (
        ("source" = 'manual' and "ingestionId" is null)
        or
        ("source" <> 'manual' and "ingestionId" is not null)
      )
  `.execute(db);

  await sql`alter table ingestion alter column source type text using source::text`.execute(db);
  await sql`alter table import_source alter column source type text using source::text`.execute(db);
  await sql`drop type ingestion_source`.execute(db);
}

export async function down(db: Kysely<object>): Promise<void> {
  await sql`create type ingestion_source as enum ('nuclei')`.execute(db);
  await sql`alter table ingestion alter column source type ingestion_source using source::ingestion_source`.execute(
    db,
  );
  await sql`alter table import_source alter column source type ingestion_source using source::ingestion_source`.execute(
    db,
  );

  await sql`alter table observation drop constraint observation_source_ingestion_check`.execute(db);
  await sql`alter type observation_source rename to observation_source_manual`.execute(db);
  await sql`create type observation_source as enum ('manual', 'nuclei')`.execute(db);
  await sql`alter table observation alter column source type observation_source using source::text::observation_source`.execute(
    db,
  );
  await sql`drop type observation_source_manual`.execute(db);
  await sql`
    alter table observation add constraint observation_source_ingestion_check
      check (
        ("source" = 'manual' and "ingestionId" is null)
        or
        ("source" <> 'manual' and "ingestionId" is not null)
      )
  `.execute(db);
}
