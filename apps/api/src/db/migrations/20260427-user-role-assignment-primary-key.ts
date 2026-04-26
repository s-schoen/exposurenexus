import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<object>): Promise<void> {
  await sql`
    delete from user_role_assignment left_assignment
    using user_role_assignment right_assignment
    where left_assignment.ctid < right_assignment.ctid
      and left_assignment."userId" = right_assignment."userId"
      and left_assignment."roleId" = right_assignment."roleId"
  `.execute(db)

  await db.schema
    .alterTable("user_role_assignment")
    .addPrimaryKeyConstraint("user_role_assignment_pkey", ["userId", "roleId"])
    .execute()
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema
    .alterTable("user_role_assignment")
    .dropConstraint("user_role_assignment_pkey")
    .execute()
}
