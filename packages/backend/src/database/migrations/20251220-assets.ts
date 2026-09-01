import { Kysely, sql } from "kysely";

// oxlint-disable-next-line typescript/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType("asset_type").asEnum(["host", "software", "container"]).execute();

  await db.schema
    .createTable("asset")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", sql`asset_type`, (col) => col.notNull())
    .execute();
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("asset").execute();
  await db.schema.dropType("asset_type").execute();
}
