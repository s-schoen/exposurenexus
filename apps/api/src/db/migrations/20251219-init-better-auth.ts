import { Kysely, sql } from "kysely"

// eslint-disable-next-line
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user")
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) => col.notNull())
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("username", "text", (col) => col.unique())
    .addColumn("displayUsername", "text")
    .execute()

  await db.schema
    .createTable("session")
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("userId", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade")
    )
    .execute()

  await db.schema
    .createTable("account")
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("accountId", "text", (col) => col.notNull())
    .addColumn("providerId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade")
    )
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .execute()

  await db.schema
    .createTable("verification")
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute()

  await db.schema
    .createIndex("session_userId_idx")
    .on("session")
    .column("userId")
    .execute()

  await db.schema
    .createIndex("account_userId_idx")
    .on("account")
    .column("userId")
    .execute()

  await db.schema
    .createIndex("verification_identifier_idx")
    .on("verification")
    .column("identifier")
    .execute()
}

// eslint-disable-next-line
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("verification_identifier_idx").execute()
  await db.schema.dropIndex("account_userId_idx").execute()
  await db.schema.dropIndex("session_userId_idx").execute()

  await db.schema.dropTable("verification").execute()
  await db.schema.dropTable("account").execute()
  await db.schema.dropTable("session").execute()
  await db.schema.dropTable("user").execute()
}
