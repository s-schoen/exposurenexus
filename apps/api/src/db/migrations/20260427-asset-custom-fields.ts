import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import { Kysely, sql } from "kysely"

// eslint-disable-next-line
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType("asset_custom_field_type")
    .asEnum(Object.values(AssetCustomFieldType))
    .execute()

  await db.schema
    .createTable("asset_custom_field")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("key", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", sql`asset_custom_field_type`, (col) => col.notNull())
    .addColumn("required", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("defaultValue", "jsonb")
    .execute()

  await db.schema
    .createTable("asset_custom_field_option")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("fieldId", "uuid", (col) =>
      col.notNull().references("asset_custom_field.id").onDelete("cascade")
    )
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addUniqueConstraint("asset_custom_field_option_field_value_unique", [
      "fieldId",
      "value"
    ])
    .execute()

  await db.schema
    .createTable("asset_custom_field_value")
    .addColumn("assetId", "uuid", (col) =>
      col.notNull().references("asset.id").onDelete("cascade")
    )
    .addColumn("fieldId", "uuid", (col) =>
      col.notNull().references("asset_custom_field.id").onDelete("cascade")
    )
    .addColumn("value", "jsonb", (col) => col.notNull())
    .addPrimaryKeyConstraint("asset_custom_field_value_pkey", [
      "assetId",
      "fieldId"
    ])
    .execute()
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("asset_custom_field_value").execute()
  await db.schema.dropTable("asset_custom_field_option").execute()
  await db.schema.dropTable("asset_custom_field").execute()
  await db.schema.dropType("asset_custom_field_type").execute()
}
