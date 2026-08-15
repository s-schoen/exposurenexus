import { sql, type Kysely } from "kysely";

const legacyAssetTypeName = "asset_type_legacy";

async function replaceAssetTypeEnum(
  db: Kysely<object>,
  values: readonly string[],
  replacement: string,
  legacyValue: string,
): Promise<void> {
  await sql`alter type "asset_type" rename to ${sql.id(legacyAssetTypeName)}`.execute(db);
  await sql`
    create type "asset_type" as enum (${sql.join(
      values.map((value) => sql.lit(value)),
      sql`, `,
    )})
  `.execute(db);
  await sql`
    alter table "asset"
      alter column "type" type "asset_type"
      using (
        case
          when "type"::text = ${sql.lit(legacyValue)} then ${sql.lit(replacement)}
          else "type"::text
        end
      )::"asset_type"
  `.execute(db);
  await sql`drop type ${sql.id(legacyAssetTypeName)}`.execute(db);
}

async function assertNoExistingAssets(db: Kysely<object>): Promise<void> {
  const assetCount = await sql<{ count: number }>`
    select count(*)::int as count
    from "asset"
  `.execute(db);

  if ((assetCount.rows[0]?.count ?? 0) > 0) {
    throw new Error("asset model cutover does not backfill existing asset rows");
  }
}

export async function up(db: Kysely<object>): Promise<void> {
  await assertNoExistingAssets(db);
  await db.schema.alterTable("asset").renameColumn("name", "displayName").execute();

  await replaceAssetTypeEnum(
    db,
    ["host", "software", "containerImage", "cloudResource"],
    "containerImage",
    "container",
  );

  await sql`
    alter table "asset"
      alter column "displayName" type varchar(255)
      using "displayName"::varchar(255)
  `.execute(db);

  await db.schema
    .createType("asset_environment")
    .asEnum(["development", "staging", "production", "unknown", "notApplicable"])
    .execute();
  await db.schema.createType("asset_lifecycle_state").asEnum(["active", "archived"]).execute();

  await db.schema
    .alterTable("asset")
    .addColumn("environment", sql`asset_environment`, (col) => col.notNull().defaultTo("unknown"))
    .addColumn("lifecycleState", sql`asset_lifecycle_state`, (col) =>
      col.notNull().defaultTo("active"),
    )
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("createdBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .addColumn("updatedBy", "uuid", (col) =>
      col.notNull().references("user_profile.id").onDelete("restrict"),
    )
    .execute();
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("asset")
    .dropColumn("updatedBy")
    .dropColumn("createdBy")
    .dropColumn("updatedAt")
    .dropColumn("createdAt")
    .dropColumn("lifecycleState")
    .dropColumn("environment")
    .execute();

  await db.schema.dropType("asset_lifecycle_state").execute();
  await db.schema.dropType("asset_environment").execute();

  await db.schema.alterTable("asset").renameColumn("displayName", "name").execute();
  await sql`
    alter table "asset"
      alter column "name" type text
      using "name"::text
  `.execute(db);

  await replaceAssetTypeEnum(
    db,
    ["host", "software", "container", "cloudResource"],
    "container",
    "containerImage",
  );
}
