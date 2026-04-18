import { Kysely, sql } from "kysely"

// eslint-disable-next-line
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    update "user"
    set "role" = 'viewer'
    where "role" is null or "role" = 'user'
  `.execute(db)

  await sql`
    alter table "user"
    alter column "role" set default 'viewer'
  `.execute(db)
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  // This migration intentionally performs a schema-only rollback.
  // Rewriting persisted viewer roles back to user would corrupt legitimate
  // post-rollout data because the same stored value may have been assigned
  // after the migration for real RBAC reasons rather than by the backfill.
  await sql`
    alter table "user"
    alter column "role" set default 'user'
  `.execute(db)
}
