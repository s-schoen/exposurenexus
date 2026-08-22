import { sql, type Kysely } from "kysely";

const legacyDomainTables = ["finding", "vulnerability", "vulnerability_source_mapping"] as const;

async function countRows(db: Kysely<object>, table: (typeof legacyDomainTables)[number]) {
  const result = await sql<{ count: number }>`
    select count(*)::int as count
    from ${sql.id(table)}
  `.execute(db);

  return result.rows[0]?.count ?? 0;
}

async function assertLegacyDomainIsEmpty(db: Kysely<object>): Promise<void> {
  const counts = await Promise.all(legacyDomainTables.map((table) => countRows(db, table)));

  if (counts.some((count) => count > 0)) {
    throw new Error(
      "observation model cutover does not backfill existing finding or vulnerability data",
    );
  }
}

async function addJsonObjectConstraint(
  db: Kysely<object>,
  table: string,
  column: string,
): Promise<void> {
  await sql`
    alter table ${sql.id(table)}
      add constraint ${sql.id(`${table}_${column}_object_check`)}
      check (jsonb_typeof(${sql.id(column)}) = 'object')
  `.execute(db);
}

async function createFinalTables(db: Kysely<object>): Promise<void> {
  await db.schema
    .createType("vulnerability_type")
    .asEnum(["cve", "cwe", "ghsa", "advisory", "custom"])
    .execute();
  await db.schema.createType("observation_source").asEnum(["manual", "nuclei"]).execute();
  await db.schema.createType("ingestion_source").asEnum(["nuclei"]).execute();

  await db.schema
    .createTable("vulnerability")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("type", sql`vulnerability_type`, (col) => col.notNull())
    .addColumn("identifier", "varchar(255)", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("severity", sql`vuln_severity`, (col) => col.notNull())
    .addColumn("metadata", "jsonb")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();

  await db.schema
    .createIndex("vulnerability_type_identifier_unique")
    .on("vulnerability")
    .columns(["type", "identifier"])
    .unique()
    .execute();
  await addJsonObjectConstraint(db, "vulnerability", "metadata");

  await db.schema
    .createTable("ingestion")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("source", sql`ingestion_source`, (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();

  await db.schema
    .createTable("finding")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("assetId", "uuid", (col) =>
      col.notNull().references("asset.id").onDelete("restrict"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("severity", sql`vuln_severity`, (col) => col.notNull())
    .addColumn("status", sql`finding_status`, (col) => col.notNull().defaultTo("active"))
    .addColumn("assigneeId", "uuid", (col) =>
      col.references("user_profile.id").onDelete("set null"),
    )
    .addColumn("dueDate", "timestamptz")
    .addColumn("mitigation", "text")
    .addColumn("weakness", "jsonb", (col) => col.notNull())
    .addColumn("affectedResource", "jsonb", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();
  await addJsonObjectConstraint(db, "finding", "weakness");
  await addJsonObjectConstraint(db, "finding", "affectedResource");

  await db.schema
    .createTable("finding_vulnerability")
    .addColumn("findingId", "uuid", (col) =>
      col.notNull().references("finding.id").onDelete("cascade"),
    )
    .addColumn("vulnerabilityId", "uuid", (col) =>
      col.notNull().references("vulnerability.id").onDelete("cascade"),
    )
    .addPrimaryKeyConstraint("finding_vulnerability_pkey", ["findingId", "vulnerabilityId"])
    .execute();

  await db.schema
    .createTable("observation")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("findingId", "uuid", (col) =>
      col.notNull().references("finding.id").onDelete("cascade"),
    )
    .addColumn("ingestionId", "uuid", (col) => col.references("ingestion.id").onDelete("restrict"))
    .addColumn("source", sql`observation_source`, (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("evidence", "text")
    .addColumn("remediation", "text")
    .addColumn("severity", sql`vuln_severity`, (col) => col.notNull())
    .addColumn("weakness", "jsonb", (col) => col.notNull())
    .addColumn("affectedResource", "jsonb", (col) => col.notNull())
    .addColumn("observedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addCheckConstraint(
      "observation_source_ingestion_check",
      sql`(
        ("source" = 'manual' and "ingestionId" is null)
        or
        ("source" <> 'manual' and "ingestionId" is not null)
      )`,
    )
    .execute();
  await addJsonObjectConstraint(db, "observation", "weakness");
  await addJsonObjectConstraint(db, "observation", "affectedResource");
  await db.schema
    .createIndex("observation_finding_observedAt_idx")
    .on("observation")
    .columns(["findingId", "observedAt", "id"])
    .execute();
}

async function createLegacyTables(db: Kysely<object>): Promise<void> {
  await db.schema
    .createTable("vulnerability")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("severity", sql`vuln_severity`, (col) => col.notNull())
    .addColumn("cve", "varchar(255)")
    .addColumn("cwe", "integer")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();

  await db.schema
    .createTable("vulnerability_source_mapping")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("matchQuery", "text", (col) => col.notNull())
    .addColumn("vulnerabilityId", "uuid", (col) =>
      col.notNull().references("vulnerability.id").onDelete("cascade"),
    )
    .execute();
  await db.schema
    .createIndex("vulnerability_source_mapping_source_matchQuery_unique")
    .on("vulnerability_source_mapping")
    .columns(["source", "matchQuery"])
    .unique()
    .execute();

  await db.schema
    .createTable("finding")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("assetId", "uuid", (col) =>
      col.notNull().references("asset.id").onDelete("restrict"),
    )
    .addColumn("vulnerabilityId", "uuid", (col) =>
      col.notNull().references("vulnerability.id").onDelete("restrict"),
    )
    .addColumn("severity", sql`vuln_severity`, (col) => col.notNull())
    .addColumn("status", sql`finding_status`, (col) => col.notNull().defaultTo("active"))
    .addColumn("evidence", "text")
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("mitigation", "text")
    .addColumn("firstSeen", "timestamptz", (col) => col.notNull())
    .addColumn("lastSeen", "timestamptz", (col) => col.notNull())
    .addColumn("fingerprint", "text", (col) => col.notNull())
    .addColumn("assigneeId", "uuid", (col) =>
      col.references("user_profile.id").onDelete("set null"),
    )
    .addColumn("dueDate", "timestamptz")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();
}

export async function up(db: Kysely<object>): Promise<void> {
  await assertLegacyDomainIsEmpty(db);

  await db.schema.dropTable("vulnerability_source_mapping").ifExists().execute();
  await db.schema.dropTable("finding").ifExists().execute();
  await db.schema.dropTable("vulnerability").ifExists().execute();

  await createFinalTables(db);
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.dropTable("vulnerability_source_mapping").ifExists().execute();
  await db.schema.dropTable("observation").ifExists().execute();
  await db.schema.dropTable("finding_vulnerability").ifExists().execute();
  await db.schema.dropTable("finding").ifExists().execute();
  await db.schema.dropTable("ingestion").ifExists().execute();
  await db.schema.dropTable("vulnerability").ifExists().execute();

  await db.schema.dropType("ingestion_source").ifExists().execute();
  await db.schema.dropType("observation_source").ifExists().execute();
  await db.schema.dropType("vulnerability_type").ifExists().execute();

  await createLegacyTables(db);
}
