import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { sql } from "kysely"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@openvlp/types/model/rbac"

vi.mock("../env.js", () => ({
  env: {
    PORT: 3001,
    LOG_LEVEL: "info",
    CORS_ORIGIN: "http://localhost:3000",
    AUTH_SESSION_LIFETIME: 12,
    AUTH_COOKIE_SECURE: true,
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789",
    DATABASE_URL: "postgres://openvlp:openvlp@localhost:5432/openvlp",
    API_TIMEOUT_MS: 5000
  }
}))

const { createTestDatabase } = await import("../test/db.js")

describe("db migration columns", () => {
  const testDb = createTestDatabase()

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  it("drops legacy auth tables and points audit columns at user profiles", async () => {
    const legacyAuthTables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('user', 'session', 'account', 'verification')
    `.execute(testDb.db)

    const userSessionColumns = await sql<{
      column_name: string
      data_type: string
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'user_session'
    `.execute(testDb.db)
    const auditColumns = await sql<{
      table_name: string
      column_name: string
      data_type: string
    }>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_name in ('vulnerability', 'finding')
        and column_name in ('createdBy', 'updatedBy')
      order by table_name asc, column_name asc
    `.execute(testDb.db)
    const auditForeignKeys = await sql<{
      constraint_name: string
      source_table: string
      target_table: string
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where rc.constraint_name in (
        'vulnerability_createdBy_fkey',
        'vulnerability_updatedBy_fkey',
        'finding_createdBy_fkey',
        'finding_updatedBy_fkey'
      )
      order by constraint_name asc
    `.execute(testDb.db)

    expect(legacyAuthTables.rows).toEqual([])
    expect(userSessionColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "sessionId",
          data_type: "text"
        })
      ])
    )
    expect(auditColumns.rows).toEqual(
      expect.arrayContaining([
        {
          table_name: "finding",
          column_name: "createdBy",
          data_type: "uuid"
        },
        {
          table_name: "finding",
          column_name: "updatedBy",
          data_type: "uuid"
        },
        {
          table_name: "vulnerability",
          column_name: "createdBy",
          data_type: "uuid"
        },
        {
          table_name: "vulnerability",
          column_name: "updatedBy",
          data_type: "uuid"
        }
      ])
    )
    expect(auditForeignKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_name: "finding_createdBy_fkey",
          target_table: "user_profile"
        }),
        expect.objectContaining({
          constraint_name: "finding_updatedBy_fkey",
          target_table: "user_profile"
        }),
        expect.objectContaining({
          constraint_name: "vulnerability_createdBy_fkey",
          target_table: "user_profile"
        }),
        expect.objectContaining({
          constraint_name: "vulnerability_updatedBy_fkey",
          target_table: "user_profile"
        })
      ])
    )
  })

  it("creates normalized rbac tables with seeded built-in data", async () => {
    const roleColumns = await sql<{
      column_name: string
      data_type: string
      column_default: string | null
    }>`
      select column_name, data_type, column_default
      from information_schema.columns
      where table_name = 'role'
    `.execute(testDb.db)

    const permissionAssignmentColumns = await sql<{
      column_name: string
      data_type: string
      udt_name: string
    }>`
      select column_name, data_type, udt_name
      from information_schema.columns
      where table_name = 'role_permission_assignment'
    `.execute(testDb.db)

    const roleRows = await sql<{ id: string; name: string }>`
      select id, name
      from role
      order by name asc
    `.execute(testDb.db)

    const adminPermissions = await sql<{
      resource: string
      verb: string
    }>`
      select resource, verb
      from role_permission_assignment
      where role_id = ${builtInRoleIds.admin}
    `.execute(testDb.db)

    expect(roleColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "id",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "name",
          data_type: "text"
        })
      ])
    )

    expect(permissionAssignmentColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "role_id",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "resource",
          data_type: "USER-DEFINED",
          udt_name: "permission_resource"
        }),
        expect.objectContaining({
          column_name: "verb",
          data_type: "USER-DEFINED",
          udt_name: "permission_verb"
        })
      ])
    )

    const roleIdColumn = roleColumns.rows.find(
      (row) => row.column_name === "id"
    )

    expect(roleIdColumn?.column_default).toContain("gen_random_uuid()")
    expect(roleRows.rows).toEqual(
      expect.arrayContaining([
        { id: builtInRoleIds.admin, name: BuiltInRoleName.Admin },
        { id: builtInRoleIds.editor, name: BuiltInRoleName.Editor },
        { id: builtInRoleIds.viewer, name: BuiltInRoleName.Viewer }
      ])
    )
    expect(adminPermissions.rows).toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.User,
          verb: PermissionVerb.Write
        },
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Delete
        }
      ])
    )
  })
})
