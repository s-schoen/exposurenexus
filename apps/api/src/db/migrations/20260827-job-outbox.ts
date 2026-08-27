import { Kysely, sql } from "kysely";

const publicationEligibilityIndex = "job_publication_eligibility";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("job")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("event", "jsonb", (column) => column.notNull())
    .addColumn("publicationState", "text", (column) => column.notNull())
    .addColumn("publicationAttempts", "integer", (column) => column.notNull())
    .addColumn("nextPublicationAttemptAt", "timestamptz")
    .addColumn("lastPublicationError", "text")
    .addColumn("publishedAt", "timestamptz")
    .addColumn("abandonedAt", "timestamptz")
    .addColumn("executionState", "text", (column) => column.notNull())
    .addColumn("executionStartedAt", "timestamptz")
    .addColumn("executionFinishedAt", "timestamptz")
    .addColumn("executionError", "text")
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .addCheckConstraint(
      "job_event_identity_check",
      sql`jsonb_typeof("event") = 'object' and "event" ? 'id' and "event" ->> 'id' = "id"::text`,
    )
    .addCheckConstraint(
      "job_publication_attempts_nonnegative_check",
      sql`"publicationAttempts" >= 0`,
    )
    .addCheckConstraint(
      "job_publication_state_check",
      sql`"publicationState" in ('pending', 'published', 'failed', 'abandoned')`,
    )
    .addCheckConstraint(
      "job_execution_state_check",
      sql`"executionState" in ('pending', 'running', 'succeeded', 'failed')`,
    )
    .execute();

  await db.schema
    .createIndex(publicationEligibilityIndex)
    .on("job")
    .columns(["publicationState", "nextPublicationAttemptAt", "createdAt", "id"])
    .execute();
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex(publicationEligibilityIndex).execute();
  await db.schema.dropTable("job").execute();
}
