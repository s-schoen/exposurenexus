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
} from "@openvlp/types/model/rbac"
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
            }
          ])
        },
        {
          id: builtInRoleIds.viewer,
          name: BuiltInRoleName.Viewer,
          permissions: expect.arrayContaining([
            { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
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

  it("renames assigned users when a role name changes", async () => {
    const repository = createRoleRepository(testDb.db)
    const roleId = "1f5c0b37-7d1d-42ce-9e1a-51906b9e6830"

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
      .insertInto("user")
      .values([
        {
          id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
          name: "Analyst User",
          email: "analyst@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          username: "analyst",
          displayUsername: "Analyst",
          role: "analyst"
        },
        {
          id: "05aa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
          name: "Viewer Analyst User",
          email: "viewer-analyst@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          username: "viewer-analyst",
          displayUsername: "Viewer Analyst",
          role: "viewer, analyst"
        },
        {
          id: "5caa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
          name: "Senior Analyst User",
          email: "senior-analyst@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          username: "senior-analyst",
          displayUsername: "Senior Analyst",
          role: "senior-analyst"
        },
        {
          id: "7caa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
          name: "Contractor User",
          email: "contractor@example.com",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-01-04T00:00:00.000Z"),
          updatedAt: new Date("2026-01-04T00:00:00.000Z"),
          username: "contractor",
          displayUsername: "Contractor",
          role: "contractor"
        }
      ])
      .execute()

    await expect(
      repository.updateByID(roleId, {
        name: "security-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          }
        ]
      })
    ).resolves.toEqual({
      id: roleId,
      name: "security-analyst",
      permissions: [
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        }
      ]
    })

    const users = await testDb.db
      .selectFrom("user")
      .select(["id", "role"])
      .where("id", "in", [
        "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
        "05aa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
        "5caa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
        "7caa7671-ef43-4cd1-bf4c-76ca2c33b4ab"
      ])
      .orderBy("id", "asc")
      .execute()

    expect(users).toEqual([
      {
        id: "05aa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
        role: "viewer,security-analyst"
      },
      {
        id: "5caa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
        role: "senior-analyst"
      },
      {
        id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
        role: "security-analyst"
      },
      {
        id: "7caa7671-ef43-4cd1-bf4c-76ca2c33b4ab",
        role: "contractor"
      }
    ])
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
})
