import { sql, type Kysely } from "kysely"
import { PermissionResource } from "@openvlp/types/model/rbac"

// eslint-disable-next-line
export async function up(db: Kysely<any>): Promise<void> {
  const existing = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from pg_enum
      join pg_type on pg_enum.enumtypid = pg_type.oid
      where pg_type.typname = 'permission_resource'
        and pg_enum.enumlabel = ${PermissionResource.CustomField}
    ) as exists
  `.execute(db)

  if (existing.rows[0]?.exists) {
    return
  }

  await sql`
    alter type permission_resource
    add value ${sql.lit(PermissionResource.CustomField)}
  `.execute(db)
}

// eslint-disable-next-line
export async function down(_db: Kysely<any>): Promise<void> {}
