import { type Kysely, sql } from "kysely";

const uuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const uuidPatternSql = sql.lit(uuidPattern);
const auditTables = ["vulnerability", "finding"] as const;
const auditColumns = ["createdBy", "updatedBy"] as const;

type AuditTable = (typeof auditTables)[number];
type AuditColumn = (typeof auditColumns)[number];

interface AuditTableRecord {
  createdBy: string | null;
  updatedBy: string | null;
}

interface MigrationDatabase {
  vulnerability: AuditTableRecord;
  finding: AuditTableRecord;
  user_profile: {
    id: string;
  };
}

function auditForeignKeyName(table: AuditTable, column: AuditColumn): string {
  return `${table}_${column}_fkey`;
}

async function dropAuditForeignKeys(
  db: Kysely<MigrationDatabase>,
  table: AuditTable,
): Promise<void> {
  for (const column of auditColumns) {
    await db.schema
      .alterTable(table)
      .dropConstraint(auditForeignKeyName(table, column))
      .ifExists()
      .execute();
  }
}

async function addAuditForeignKeys(
  db: Kysely<MigrationDatabase>,
  table: AuditTable,
  targetTable: "user" | "user_profile",
): Promise<void> {
  for (const column of auditColumns) {
    await db.schema
      .alterTable(table)
      .addForeignKeyConstraint(
        auditForeignKeyName(table, column),
        [column],
        targetTable,
        ["id"],
        (constraint) => constraint.onDelete("set null"),
      )
      .execute();
  }
}

async function nullAuditReferencesWithoutProfile(
  db: Kysely<MigrationDatabase>,
  table: AuditTable,
  column: AuditColumn,
): Promise<void> {
  await db
    .updateTable(table)
    .set({ [column]: null } as Partial<AuditTableRecord>)
    .where(column, "is not", null)
    .where(column, "not in", db.selectFrom("user_profile").select("id"))
    .execute();
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  for (const table of auditTables) {
    await dropAuditForeignKeys(db, table);
  }

  await sql`
    alter table "vulnerability"
      alter column "createdBy" type uuid using (
        case when "createdBy" ~* ${uuidPatternSql} then "createdBy"::uuid else null end
      ),
      alter column "updatedBy" type uuid using (
        case when "updatedBy" ~* ${uuidPatternSql} then "updatedBy"::uuid else null end
      )
  `.execute(db);

  await sql`
    alter table "finding"
      alter column "createdBy" type uuid using (
        case when "createdBy" ~* ${uuidPatternSql} then "createdBy"::uuid else null end
      ),
      alter column "updatedBy" type uuid using (
        case when "updatedBy" ~* ${uuidPatternSql} then "updatedBy"::uuid else null end
      )
  `.execute(db);

  for (const table of auditTables) {
    for (const column of auditColumns) {
      await nullAuditReferencesWithoutProfile(db, table, column);
    }

    await addAuditForeignKeys(db, table, "user_profile");
  }

  await db.schema.dropTable("account").ifExists().execute();
  await db.schema.dropTable("session").ifExists().execute();
  await db.schema.dropTable("verification").ifExists().execute();
  await db.schema.dropTable("user").ifExists().execute();
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  for (const table of auditTables) {
    await dropAuditForeignKeys(db, table);
    await db
      .updateTable(table)
      .set({
        createdBy: null,
        updatedBy: null,
      })
      .execute();
  }

  await sql`
    alter table "vulnerability"
      alter column "createdBy" type text using "createdBy"::text,
      alter column "updatedBy" type text using "updatedBy"::text
  `.execute(db);

  await sql`
    alter table "finding"
      alter column "createdBy" type text using "createdBy"::text,
      alter column "updatedBy" type text using "updatedBy"::text
  `.execute(db);

  await db.schema
    .createTable("user")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) => col.notNull())
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("username", "text", (col) => col.unique())
    .addColumn("displayUsername", "text")
    .addColumn("role", "text", (col) => col.defaultTo("viewer"))
    .addColumn("banned", "boolean", (col) => col.defaultTo(false))
    .addColumn("banReason", "text")
    .addColumn("banExpires", "timestamptz")
    .execute();

  await db.schema
    .createTable("session")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("impersonatedBy", "text")
    .execute();

  await db.schema
    .createTable("account")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("accountId", "text", (col) => col.notNull())
    .addColumn("providerId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("verification")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("session_userId_idx")
    .ifNotExists()
    .on("session")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("account_userId_idx")
    .ifNotExists()
    .on("account")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("verification_identifier_idx")
    .ifNotExists()
    .on("verification")
    .column("identifier")
    .execute();

  for (const table of auditTables) {
    await addAuditForeignKeys(db, table, "user");
  }
}
