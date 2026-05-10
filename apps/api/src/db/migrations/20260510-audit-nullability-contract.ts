import { type Kysely, sql } from "kysely"

const auditTables = ["vulnerability", "finding"] as const
const auditColumns = ["createdBy", "updatedBy"] as const

type AuditTable = (typeof auditTables)[number]
type AuditColumn = (typeof auditColumns)[number]
type AuditDeleteAction = "restrict" | "set null"

function auditForeignKeyName(table: AuditTable, column: AuditColumn): string {
  return `${table}_${column}_fkey`
}

async function dropAuditForeignKeys(db: Kysely<object>): Promise<void> {
  for (const table of auditTables) {
    for (const column of auditColumns) {
      await db.schema
        .alterTable(table)
        .dropConstraint(auditForeignKeyName(table, column))
        .ifExists()
        .execute()
    }
  }
}

async function addAuditForeignKeys(
  db: Kysely<object>,
  onDelete: AuditDeleteAction
): Promise<void> {
  for (const table of auditTables) {
    for (const column of auditColumns) {
      await db.schema
        .alterTable(table)
        .addForeignKeyConstraint(
          auditForeignKeyName(table, column),
          [column],
          "user_profile",
          ["id"],
          (constraint) => constraint.onDelete(onDelete)
        )
        .execute()
    }
  }
}

export async function up(db: Kysely<object>): Promise<void> {
  await dropAuditForeignKeys(db)

  await sql`
    alter table "finding"
      alter column "createdBy" set not null,
      alter column "updatedBy" set not null
  `.execute(db)

  await sql`
    alter table "vulnerability"
      alter column "createdBy" set not null,
      alter column "updatedBy" set not null
  `.execute(db)

  await sql`
    alter table "user_profile"
      alter column "enabled" set default true,
      alter column "enabled" set not null
  `.execute(db)

  await addAuditForeignKeys(db, "restrict")
}

export async function down(db: Kysely<object>): Promise<void> {
  await dropAuditForeignKeys(db)

  await sql`
    alter table "finding"
      alter column "createdBy" drop not null,
      alter column "updatedBy" drop not null
  `.execute(db)

  await sql`
    alter table "vulnerability"
      alter column "createdBy" drop not null,
      alter column "updatedBy" drop not null
  `.execute(db)

  await sql`
    alter table "user_profile"
      alter column "enabled" drop not null
  `.execute(db)

  await addAuditForeignKeys(db, "set null")
}
