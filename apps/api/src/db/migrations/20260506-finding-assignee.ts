import { type Kysely } from "kysely"

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("finding")
    .addColumn("assigneeId", "uuid", (col) =>
      col.references("user_profile.id").onDelete("set null")
    )
    .execute()
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("finding").dropColumn("assigneeId").execute()
}
