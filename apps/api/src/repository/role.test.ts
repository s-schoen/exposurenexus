import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@exposurenexus/types/model/rbac"
import { createRoleRepository } from "./role.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("role repository", () => {
  const testDb = createTestDatabase()

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
  })

  it("lists seeded roles with their permissions", async () => {
    const repository = createRoleRepository(testDb.db)

    const roles = await repository.list()

    expect(roles).toHaveLength(3)
    expect(roles).toEqual(
      expect.arrayContaining([
        {
          id: builtInRoleIds.admin,
          name: BuiltInRoleName.Admin,
          permissions: expect.arrayContaining([
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
        },
        {
          id: builtInRoleIds.editor,
          name: BuiltInRoleName.Editor,
          permissions: expect.arrayContaining([
            {
              resource: PermissionResource.Import,
              verb: PermissionVerb.Write
            },
            {
              resource: PermissionResource.CustomField,
              verb: PermissionVerb.Write
            }
          ])
        },
        {
          id: builtInRoleIds.viewer,
          name: BuiltInRoleName.Viewer,
          permissions: expect.arrayContaining([
            { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
            {
              resource: PermissionResource.CustomField,
              verb: PermissionVerb.Read
            },
            {
              resource: PermissionResource.Finding,
              verb: PermissionVerb.Read
            },
            {
              resource: PermissionResource.Vulnerability,
              verb: PermissionVerb.Read
            },
            {
              resource: PermissionResource.Stats,
              verb: PermissionVerb.Read
            }
          ])
        }
      ])
    )
  })

  it("returns a role by id", async () => {
    const repository = createRoleRepository(testDb.db)

    await expect(repository.getByID(builtInRoleIds.viewer)).resolves.toEqual({
      id: builtInRoleIds.viewer,
      name: BuiltInRoleName.Viewer,
      permissions: expect.arrayContaining([
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        {
          resource: PermissionResource.CustomField,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Finding,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Vulnerability,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Stats,
          verb: PermissionVerb.Read
        }
      ])
    })
  })

  it("returns null for unknown role ids", async () => {
    const repository = createRoleRepository(testDb.db)

    await expect(
      repository.getByID("c738c53c-1660-4535-b630-8a3b99505555")
    ).resolves.toBeNull()
  })

  it("returns matching roles by ids in database order", async () => {
    const repository = createRoleRepository(testDb.db)

    const roles = await repository.getByIDs([
      builtInRoleIds.viewer,
      builtInRoleIds.admin,
      builtInRoleIds.viewer
    ])

    expect(roles).toHaveLength(2)
    expect(roles).toEqual(
      expect.arrayContaining([
        {
          id: builtInRoleIds.admin,
          name: BuiltInRoleName.Admin,
          permissions: expect.any(Array)
        },
        {
          id: builtInRoleIds.viewer,
          name: BuiltInRoleName.Viewer,
          permissions: expect.any(Array)
        }
      ])
    )
  })

  it("returns matching roles by names in database order", async () => {
    const repository = createRoleRepository(testDb.db)

    const roles = await repository.getByNames([
      BuiltInRoleName.Editor,
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Editor
    ])

    expect(roles).toHaveLength(2)
    expect(roles).toEqual(
      expect.arrayContaining([
        {
          id: builtInRoleIds.viewer,
          name: BuiltInRoleName.Viewer,
          permissions: expect.any(Array)
        },
        {
          id: builtInRoleIds.editor,
          name: BuiltInRoleName.Editor,
          permissions: expect.any(Array)
        }
      ])
    )
  })

  it("updates a role and replaces its permissions", async () => {
    const repository = createRoleRepository(testDb.db)
    const roleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "analyst" })
      .execute()
    await testDb.db
      .insertInto("role_permission_assignment")
      .values([
        {
          role_id: roleId,
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        },
        {
          role_id: roleId,
          resource: PermissionResource.Finding,
          verb: PermissionVerb.Read
        }
      ])
      .execute()

    await expect(
      repository.updateByID(roleId, {
        name: "incident-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write
          }
        ]
      })
    ).resolves.toEqual({
      role: {
        id: roleId,
        name: "incident-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write
          }
        ]
      },
      permissionsChanged: true,
      affectedUserCount: 0,
      revokedSessionCount: 0
    })

    await expect(repository.getByID(roleId)).resolves.toEqual({
      id: roleId,
      name: "incident-analyst",
      permissions: [
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Write
        }
      ]
    })
  })

  it("revokes assigned user sessions when role permissions change", async () => {
    const repository = createRoleRepository(testDb.db)
    const roleId = "3fb9f330-637a-4779-a65b-cc9a44d67850"
    const assignedUserId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"
    const unrelatedUserId = "86f9cb55-857c-4316-a4f1-a7e63ee680ad"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "analyst" })
      .execute()
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        role_id: roleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      })
      .execute()
    await testDb.db
      .insertInto("user_profile")
      .values([
        {
          id: assignedUserId,
          username: "assigned-user",
          displayName: "Assigned User",
          email: "assigned@example.com",
          enabled: true,
          passwordHash: "hash"
        },
        {
          id: unrelatedUserId,
          username: "unrelated-user",
          displayName: "Unrelated User",
          email: "unrelated@example.com",
          enabled: true,
          passwordHash: "hash"
        }
      ])
      .execute()
    await testDb.db
      .insertInto("user_role_assignment")
      .values({
        userId: assignedUserId,
        roleId
      })
      .execute()
    await testDb.db
      .insertInto("user_session")
      .values([
        {
          sessionId: "assigned-user-session-digest",
          userId: assignedUserId,
          sourceIp: "203.0.113.10",
          userAgent: "Mozilla/5.0",
          createdAt: new Date("2026-04-23T08:00:00.000Z"),
          expiresAt: new Date("2026-04-23T10:00:00.000Z")
        },
        {
          sessionId: "unrelated-user-session-digest",
          userId: unrelatedUserId,
          sourceIp: "203.0.113.11",
          userAgent: "curl/8.0.1",
          createdAt: new Date("2026-04-23T08:00:00.000Z"),
          expiresAt: new Date("2026-04-23T10:00:00.000Z")
        }
      ])
      .execute()

    await expect(
      repository.updateByID(roleId, {
        name: "analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write
          }
        ]
      })
    ).resolves.toEqual({
      role: {
        id: roleId,
        name: "analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write
          }
        ]
      },
      permissionsChanged: true,
      affectedUserCount: 1,
      revokedSessionCount: 1
    })

    const remainingSessions = await testDb.db
      .selectFrom("user_session")
      .select(["sessionId", "userId"])
      .execute()

    expect(remainingSessions).toEqual([
      {
        sessionId: "unrelated-user-session-digest",
        userId: unrelatedUserId
      }
    ])
  })

  it("does not revoke assigned user sessions for role name-only updates", async () => {
    const repository = createRoleRepository(testDb.db)
    const roleId = "38f9a236-e78d-4776-a373-ee25908be7b1"
    const assignedUserId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "name-only-analyst" })
      .execute()
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        role_id: roleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      })
      .execute()
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: assignedUserId,
        username: "assigned-user",
        displayName: "Assigned User",
        email: "assigned@example.com",
        enabled: true,
        passwordHash: "hash"
      })
      .execute()
    await testDb.db
      .insertInto("user_role_assignment")
      .values({
        userId: assignedUserId,
        roleId
      })
      .execute()
    await testDb.db
      .insertInto("user_session")
      .values({
        sessionId: "assigned-user-session-digest",
        userId: assignedUserId,
        sourceIp: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        createdAt: new Date("2026-04-23T08:00:00.000Z"),
        expiresAt: new Date("2026-04-23T10:00:00.000Z")
      })
      .execute()

    await expect(
      repository.updateByID(roleId, {
        name: "renamed-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          }
        ]
      })
    ).resolves.toEqual({
      role: {
        id: roleId,
        name: "renamed-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          }
        ]
      },
      permissionsChanged: false,
      affectedUserCount: 0,
      revokedSessionCount: 0
    })

    await expect(
      testDb.db.selectFrom("user_session").selectAll().execute()
    ).resolves.toHaveLength(1)
  })

  it("deletes a role and cascades its permission assignments", async () => {
    const repository = createRoleRepository(testDb.db)
    const roleId = "27ff3776-a905-481e-8e53-444cc55f1af5"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "contractor" })
      .execute()
    await testDb.db
      .insertInto("role_permission_assignment")
      .values({
        role_id: roleId,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      })
      .execute()

    await expect(repository.deleteByID(roleId)).resolves.toEqual({
      id: roleId,
      name: "contractor",
      permissions: [
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        }
      ]
    })

    await expect(repository.getByID(roleId)).resolves.toBeNull()

    const assignments = await testDb.db
      .selectFrom("role_permission_assignment")
      .selectAll()
      .where("role_id", "=", roleId)
      .execute()

    expect(assignments).toEqual([])
  })

  it("detects users assigned to a role by role id", async () => {
    const repository = createRoleRepository(testDb.db)
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: userId,
        username: "assigned-user",
        displayName: "Assigned User",
        email: "assigned@example.com",
        enabled: true,
        passwordHash: "hash"
      })
      .execute()
    await testDb.db
      .insertInto("user_role_assignment")
      .values({
        userId,
        roleId: builtInRoleIds.viewer
      })
      .execute()

    await expect(
      repository.hasUsersWithRoleID(builtInRoleIds.viewer)
    ).resolves.toBe(true)
    await expect(
      repository.hasUsersWithRoleID(builtInRoleIds.editor)
    ).resolves.toBe(false)
  })
})
