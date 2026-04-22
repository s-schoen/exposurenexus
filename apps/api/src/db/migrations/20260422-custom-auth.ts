// eslint-disable-next-line
import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_profile")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("username", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("display_name", "varchar(255)", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.defaultTo(true))
    .addColumn("password_hash", "text", (col) => col.notNull())
    .execute()

  await db.schema
    .createTable("user_role_assignment")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user_profile.id").onDelete("cascade").notNull()
    )
    .addColumn("role_id", "uuid", (col) =>
      col.references("role.id").onDelete("cascade").notNull()
    )
    .execute()

  await db.schema
    .createTable("user_session")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("session_id", "uuid", (col) => col.unique().notNull())
    .addColumn("user_id", "uuid", (col) =>
      col.references("user_profile.id").onDelete("cascade").notNull()
    )
    .addColumn("user_agent", "text")
    .addColumn("source_ip", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .execute()
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_profile").execute()
  await db.schema.dropTable("user_role_assignment").execute()
  await db.schema.dropTable("user_session").execute()
}
