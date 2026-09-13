import { Kysely, sql } from "kysely";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("import_source")
    .addColumn("id", "uuid", (c) => c.primaryKey().notNull())
    .addColumn("createdBy", "uuid", (c) =>
      c.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("originalFilename", "text", (c) => c.notNull())
    .addColumn("bucket", "text", (c) => c.notNull())
    .addColumn("objectKey", "text", (c) => c.notNull())
    .addColumn("expectedSize", "double precision", (c) => c.notNull())
    .addColumn("actualSize", "double precision")
    .addColumn("retentionPolicy", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("cleanupState", "text", (c) => c.notNull())
    .addColumn("createdAt", "timestamptz", (c) => c.notNull())
    .addColumn("availableAt", "timestamptz")
    .addColumn("failedAt", "timestamptz")
    .addColumn("deletedAt", "timestamptz")
    .addUniqueConstraint("import_source_object_unique", ["bucket", "objectKey"])
    .addCheckConstraint(
      "import_source_retention_check",
      sql`"retentionPolicy" in ('temporary', 'keep')`,
    )
    .addCheckConstraint(
      "import_source_state_check",
      sql`state in ('incomplete', 'available', 'deleted')`,
    )
    .addCheckConstraint(
      "import_source_cleanup_check",
      sql`"cleanupState" in ('not_needed', 'pending', 'completed', 'failed')`,
    )
    .addCheckConstraint(
      "import_source_size_check",
      sql`"expectedSize" between 0 and 9007199254740991 and "expectedSize" = trunc("expectedSize") and ("actualSize" is null or ("actualSize" between 0 and 9007199254740991 and "actualSize" = trunc("actualSize")))`,
    )
    .addCheckConstraint(
      "import_source_available_check",
      sql`state <> 'available' or ("actualSize" is not null and "actualSize" = "expectedSize" and "availableAt" is not null and "deletedAt" is null and "failedAt" is null and "cleanupState" = 'not_needed')`,
    )
    .execute();
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("import_source").execute();
}
