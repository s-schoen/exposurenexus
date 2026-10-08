import { sql, type Kysely } from "kysely";

async function assertNoScannerObservations(db: Kysely<object>): Promise<void> {
  const result = await sql<{ count: number }>`
    select count(*)::int as count
    from observation
    where source <> 'manual'
  `.execute(db);

  if ((result.rows[0]?.count ?? 0) > 0) {
    throw new Error(
      "removing scanner observation sources does not backfill existing scanner observations",
    );
  }
}

// Recreating the type keeps the new values usable in the migration transaction.
async function replaceObservationSourceType(db: Kysely<object>, values: string[]): Promise<void> {
  await sql`alter table observation drop constraint observation_source_ingestion_check`.execute(db);
  await sql`alter type observation_source rename to observation_source_previous`.execute(db);
  await sql`create type observation_source as enum (${sql.join(values.map((value) => sql.lit(value)))})`.execute(
    db,
  );
  await sql`alter table observation alter column source type observation_source using source::text::observation_source`.execute(
    db,
  );
  await sql`drop type observation_source_previous`.execute(db);
  await sql`
    alter table observation add constraint observation_source_ingestion_check
      check (
        ("source" = 'manual' and "ingestionId" is null)
        or
        ("source" <> 'manual' and "ingestionId" is not null)
      )
  `.execute(db);
}

export async function up(db: Kysely<object>): Promise<void> {
  await replaceObservationSourceType(db, [
    "manual",
    "nuclei",
    "zap",
    "semgrep",
    "bearer",
    "checkov",
    "kics",
    "trivy",
  ]);
}

export async function down(db: Kysely<object>): Promise<void> {
  await assertNoScannerObservations(db);
  await replaceObservationSourceType(db, ["manual"]);
}
