import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { sql } from "kysely"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@exposurenexus/types/model/rbac"

vi.mock("../env.js", () => ({
  env: {
    PORT: 3001,
    LOG_LEVEL: "info",
    APP_ORIGIN: "http://localhost:3000",
    AUTH_SESSION_LIFETIME: 12,
    AUTH_COOKIE_SECURE: true,
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789",
    DATABASE_URL:
      "postgres://exposurenexus:exposurenexus@localhost:5432/exposurenexus",
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

  it("adds nullable asset owner identity pointing at user profiles", async () => {
    const assetOwnerColumns = await sql<{
      column_name: string
      data_type: string
      is_nullable: string
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'asset'
        and column_name = 'ownerId'
    `.execute(testDb.db)
    const assetOwnerForeignKeys = await sql<{
      constraint_name: string
      source_table: string
      target_table: string
      delete_rule: string
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'asset'
        and kcu.column_name = 'ownerId'
    `.execute(testDb.db)

    expect(assetOwnerColumns.rows).toEqual([
      {
        column_name: "ownerId",
        data_type: "uuid",
        is_nullable: "YES"
      }
    ])
    expect(assetOwnerForeignKeys.rows).toEqual([
      expect.objectContaining({
        source_table: "asset",
        target_table: "user_profile",
        delete_rule: "SET NULL"
      })
    ])
  })

  it("adds nullable finding assignee identity pointing at user profiles", async () => {
    const findingAssigneeColumns = await sql<{
      column_name: string
      data_type: string
      is_nullable: string
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'finding'
        and column_name = 'assigneeId'
    `.execute(testDb.db)
    const findingAssigneeForeignKeys = await sql<{
      constraint_name: string
      source_table: string
      target_table: string
      delete_rule: string
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'finding'
        and kcu.column_name = 'assigneeId'
    `.execute(testDb.db)

    expect(findingAssigneeColumns.rows).toEqual([
      {
        column_name: "assigneeId",
        data_type: "uuid",
        is_nullable: "YES"
      }
    ])
    expect(findingAssigneeForeignKeys.rows).toEqual([
      expect.objectContaining({
        source_table: "finding",
        target_table: "user_profile",
        delete_rule: "SET NULL"
      })
    ])
  })

  it("adds nullable finding due dates", async () => {
    const findingDueDateColumns = await sql<{
      column_name: string
      data_type: string
      is_nullable: string
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'finding'
        and column_name = 'dueDate'
    `.execute(testDb.db)

    expect(findingDueDateColumns.rows).toEqual([
      {
        column_name: "dueDate",
        data_type: "timestamp with time zone",
        is_nullable: "YES"
      }
    ])
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
        },
        {
          resource: PermissionResource.CustomField,
          verb: PermissionVerb.Delete
        }
      ])
    )
  })

  it("creates asset custom field tables with typed defaults and values", async () => {
    const customFieldColumns = await sql<{
      column_name: string
      data_type: string
      udt_name: string
      column_default: string | null
    }>`
      select column_name, data_type, udt_name, column_default
      from information_schema.columns
      where table_name = 'asset_custom_field'
    `.execute(testDb.db)

    const optionColumns = await sql<{
      column_name: string
      data_type: string
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_option'
    `.execute(testDb.db)

    const valueColumns = await sql<{
      column_name: string
      data_type: string
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_value'
    `.execute(testDb.db)
    const assignmentColumns = await sql<{
      column_name: string
      data_type: string
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_assignment'
    `.execute(testDb.db)

    expect(customFieldColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "id",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "key",
          data_type: "text"
        }),
        expect.objectContaining({
          column_name: "type",
          data_type: "USER-DEFINED",
          udt_name: "asset_custom_field_type"
        }),
        expect.objectContaining({
          column_name: "required",
          data_type: "boolean"
        }),
        expect.objectContaining({
          column_name: "defaultValue",
          data_type: "jsonb"
        })
      ])
    )

    const customFieldIdColumn = customFieldColumns.rows.find(
      (row) => row.column_name === "id"
    )
    const customFieldRequiredColumn = customFieldColumns.rows.find(
      (row) => row.column_name === "required"
    )

    expect(customFieldIdColumn?.column_default).toContain("gen_random_uuid()")
    expect(customFieldRequiredColumn?.column_default).toBe("false")
    expect(optionColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "value",
          data_type: "text"
        }),
        expect.objectContaining({
          column_name: "label",
          data_type: "text"
        })
      ])
    )
    expect(valueColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "assetId",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "value",
          data_type: "jsonb"
        })
      ])
    )
    expect(assignmentColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "assetId",
          data_type: "uuid"
        }),
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid"
        })
      ])
    )
  })

  it("adds a unique vulnerability source mapping identity index", async () => {
    const indexes = await sql<{
      indexname: string
      indexdef: string
    }>`
      select indexname, indexdef
      from pg_indexes
      where tablename = 'vulnerability_source_mapping'
        and indexname = 'vulnerability_source_mapping_source_matchQuery_unique'
    `.execute(testDb.db)

    expect(indexes.rows).toEqual([
      expect.objectContaining({
        indexname: "vulnerability_source_mapping_source_matchQuery_unique",
        indexdef: expect.stringContaining("UNIQUE")
      })
    ])
  })
})
