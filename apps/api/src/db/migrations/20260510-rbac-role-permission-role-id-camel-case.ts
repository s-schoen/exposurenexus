import { type Kysely } from "kysely"

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("role_permission_assignment")
    .renameColumn("role_id", "roleId")
    .execute()
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("role_permission_assignment")
    .renameColumn("roleId", "role_id")
    .execute()
}
