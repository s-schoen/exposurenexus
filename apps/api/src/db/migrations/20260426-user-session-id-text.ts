import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<object>): Promise<void> {
  await sql`
    alter table "user_session"
    alter column "sessionId" type text using "sessionId"::text
  `.execute(db)
}

export async function down(db: Kysely<object>): Promise<void> {
  await sql`
    alter table "user_session"
    alter column "sessionId" type uuid using "sessionId"::uuid
  `.execute(db)
}
