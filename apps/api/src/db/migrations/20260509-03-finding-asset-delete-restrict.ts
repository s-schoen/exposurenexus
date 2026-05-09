import { type Kysely } from "kysely"

const constraintName = "finding_assetId_fkey"

async function replaceFindingAssetConstraint(
  db: Kysely<object>,
  onDelete: "cascade" | "restrict"
): Promise<void> {
  await db.schema
    .alterTable("finding")
    .dropConstraint(constraintName)
    .ifExists()
    .execute()

  await db.schema
    .alterTable("finding")
    .addForeignKeyConstraint(
      constraintName,
      ["assetId"],
      "asset",
      ["id"],
      (constraint) => constraint.onDelete(onDelete)
    )
    .execute()
}

export async function up(db: Kysely<object>): Promise<void> {
  await replaceFindingAssetConstraint(db, "restrict")
}

export async function down(db: Kysely<object>): Promise<void> {
  await replaceFindingAssetConstraint(db, "cascade")
}
