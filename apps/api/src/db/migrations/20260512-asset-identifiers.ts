import { Kysely, sql } from "kysely";

const identifierIdentityIndex = "asset_identifier_type_namespace_value_unique";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType("asset_identifier_type")
    .asEnum(["dnsName", "ipAddress", "vcsRepository", "ociImageName", "cloudResourceId"])
    .execute();

  await db.schema
    .createTable("asset_identifier")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("assetId", "uuid", (col) => col.notNull().references("asset.id").onDelete("cascade"))
    .addColumn("type", sql`asset_identifier_type`, (col) => col.notNull())
    .addColumn("namespace", "varchar(255)")
    .addColumn("value", "varchar(2048)", (col) => col.notNull())
    .execute();

  await sql`
    create unique index ${sql.id(identifierIdentityIndex)}
      on "asset_identifier" ("type", coalesce("namespace", ''), "value")
  `.execute(db);
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index ${sql.id(identifierIdentityIndex)}`.execute(db);
  await db.schema.dropTable("asset_identifier").execute();
  await db.schema.dropType("asset_identifier_type").execute();
}
