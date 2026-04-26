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
    AUTH_URL: "http://localhost:3000",
    AUTH_SESSION_LIFETIME: 12,
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

  it("creates better-auth admin plugin columns", async () => {
    const userColumns = await sql<{
      column_name: string
      column_default: string | null
    }>`
      select column_name, column_default
      from information_schema.columns
      where table_name = 'user'
    `.execute(testDb.db)

    const sessionColumns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_name = 'session'
    `.execute(testDb.db)
    const userSessionColumns = await sql<{
      column_name: string
      data_type: string
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'user_session'
    `.execute(testDb.db)

    expect(userColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["role", "banned", "banReason", "banExpires"])
    )
    expect(sessionColumns.rows.map((row) => row.column_name)).toContain(
      "impersonatedBy"
    )
    expect(userSessionColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "sessionId",
          data_type: "text"
        })
      ])
    )

    const roleColumn = userColumns.rows.find(
      (row) => row.column_name === "role"
    )

    expect(roleColumn?.column_default).toContain("viewer")
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
