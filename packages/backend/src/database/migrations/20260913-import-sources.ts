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
    .addColumn("mimeType", "text")
    .addColumn("bucket", "text", (c) => c.notNull())
    .addColumn("objectKey", "text", (c) => c.notNull())
    .addColumn("sizeBytes", "double precision", (c) => c.notNull())
    .addColumn("retentionPolicy", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("cleanupRequired", "boolean", (c) => c.notNull())
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
      "import_source_size_check",
      sql`"sizeBytes" between 0 and 9007199254740991 and "sizeBytes" = trunc("sizeBytes")`,
    )
    .addCheckConstraint(
      "import_source_available_check",
      sql`state <> 'available' or ("availableAt" is not null and "deletedAt" is null and "failedAt" is null and not "cleanupRequired")`,
    )
    .execute();
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("import_source").execute();
}
