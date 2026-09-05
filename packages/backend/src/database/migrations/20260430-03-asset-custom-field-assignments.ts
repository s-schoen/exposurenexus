import { Kysely, sql } from "kysely";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("asset_custom_field_assignment")
    .addColumn("assetId", "uuid", (col) => col.notNull().references("asset.id").onDelete("cascade"))
    .addColumn("fieldId", "uuid", (col) =>
      col.notNull().references("asset_custom_field.id").onDelete("cascade"),
    )
    .addPrimaryKeyConstraint("asset_custom_field_assignment_pkey", ["assetId", "fieldId"])
    .execute();

  await sql`
    insert into asset_custom_field_assignment ("assetId", "fieldId")
    select asset.id, asset_custom_field.id
    from asset
    cross join asset_custom_field
    on conflict do nothing
  `.execute(db);
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("asset_custom_field_assignment").execute();
}
