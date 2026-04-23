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
    .addColumn("displayName", "varchar(255)", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.defaultTo(true))
    .addColumn("passwordHash", "text", (col) => col.notNull())
    .execute()

  await db.schema
    .createTable("user_role_assignment")
    .addColumn("userId", "uuid", (col) =>
      col.references("user_profile.id").onDelete("cascade").notNull()
    )
    .addColumn("roleId", "uuid", (col) =>
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
    .addColumn("sessionId", "uuid", (col) => col.unique().notNull())
    .addColumn("userId", "uuid", (col) =>
      col.references("user_profile.id").onDelete("cascade").notNull()
    )
    .addColumn("userAgent", "text")
    .addColumn("sourceIp", "text")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .execute()
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_profile").execute()
  await db.schema.dropTable("user_role_assignment").execute()
  await db.schema.dropTable("user_session").execute()
}
