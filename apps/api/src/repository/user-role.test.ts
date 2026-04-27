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
import { createUserRoleRepository } from "./user-role.js"
import { createUserProfileRepository } from "./user-profile.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("user role repository", () => {
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
    const repository = createUserRoleRepository(testDb.db)

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
    const repository = createUserRoleRepository(testDb.db)

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
    const repository = createUserRoleRepository(testDb.db)

    await expect(
      repository.getByID("c738c53c-1660-4535-b630-8a3b99505555")
    ).resolves.toBeNull()
  })

  it("lists distinct permissions assigned to a user through their roles", async () => {
    const repository = createUserRoleRepository(testDb.db)
    const userProfile = {
      id: "ca8be35f-b523-47d1-a9d8-743dc272c0cb",
      username: "alice",
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: true,
      passwordHash: "hash-alice"
    }

    await testDb.db.insertInto("user_profile").values(userProfile).execute()
    await testDb.db
      .insertInto("user_role_assignment")
      .values([
        {
          userId: userProfile.id,
          roleId: builtInRoleIds.viewer
        },
        {
          userId: userProfile.id,
          roleId: builtInRoleIds.editor
        }
      ])
      .execute()

    await expect(
      repository.listPermissionsByUserID(userProfile.id)
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Import,
          verb: PermissionVerb.Write
        }
      ])
    )
  })

  it("returns no permissions for users without assigned roles", async () => {
    const repository = createUserRoleRepository(testDb.db)

    await expect(
      repository.listPermissionsByUserID("ca8be35f-b523-47d1-a9d8-743dc272c0cb")
    ).resolves.toEqual([])
  })

  it("returns permissions for roles assigned through user profile creation", async () => {
    const userProfileRepository = createUserProfileRepository(testDb.db)
    const userRoleRepository = createUserRoleRepository(testDb.db)
    const createdUser = await userProfileRepository.create(
      {
        username: "charlie",
        displayName: "Charlie Example",
        email: "charlie@example.com",
        enabled: true,
        passwordHash: "hash-charlie"
      },
      [builtInRoleIds.viewer]
    )

    await expect(
      userRoleRepository.listPermissionsByUserID(createdUser.id)
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Read
        },
        {
          resource: PermissionResource.Finding,
          verb: PermissionVerb.Read
        }
      ])
    )
  })

  it("creates a role with permissions", async () => {
    const repository = createUserRoleRepository(testDb.db)

    const createdRole = await repository.create({
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

    expect(createdRole).toEqual({
      id: expect.any(String),
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

    await expect(repository.getByID(createdRole.id)).resolves.toEqual(
      createdRole
    )

    const assignments = await testDb.db
      .selectFrom("role_permission_assignment")
      .select(["role_id", "resource", "verb"])
      .where("role_id", "=", createdRole.id)
      .orderBy("resource", "asc")
      .orderBy("verb", "asc")
      .execute()

    expect(assignments).toEqual([
      {
        role_id: createdRole.id,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      },
      {
        role_id: createdRole.id,
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Write
      }
    ])
  })

  it("surfaces database errors for duplicate permissions on create", async () => {
    const repository = createUserRoleRepository(testDb.db)

    await expect(
      repository.create({
        name: "duplicate-create-role",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          }
        ]
      })
    ).rejects.toThrow(/duplicate key value/i)
  })

  it("creates a role without permissions", async () => {
    const repository = createUserRoleRepository(testDb.db)

    const createdRole = await repository.create({
      name: "contractor",
      permissions: []
    })

    expect(createdRole).toEqual({
      id: expect.any(String),
      name: "contractor",
      permissions: []
    })

    const assignments = await testDb.db
      .selectFrom("role_permission_assignment")
      .selectAll()
      .where("role_id", "=", createdRole.id)
      .execute()

    expect(assignments).toEqual([])
  })

  it("updates a role and replaces its permissions", async () => {
    const repository = createUserRoleRepository(testDb.db)
    const roleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "incident-reviewer" })
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

  it("surfaces database errors for duplicate permissions on update", async () => {
    const repository = createUserRoleRepository(testDb.db)
    const roleId = "af5c0b37-7d1d-42ce-9e1a-51906b9e6830"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "duplicate-update-role" })
      .execute()

    await expect(
      repository.updateByID(roleId, {
        name: "duplicate-update-role-renamed",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          }
        ]
      })
    ).rejects.toThrow(/duplicate key value/i)
  })

  it("returns null when updating an unknown role", async () => {
    const repository = createUserRoleRepository(testDb.db)

    await expect(
      repository.updateByID("1f5c0b37-7d1d-42ce-9e1a-51906b9e6830", {
        name: "missing-role",
        permissions: []
      })
    ).resolves.toBeNull()
  })

  it("deletes a role and cascades its permission assignments", async () => {
    const repository = createUserRoleRepository(testDb.db)
    const roleId = "27ff3776-a905-481e-8e53-444cc55f1af5"

    await testDb.db
      .insertInto("role")
      .values({ id: roleId, name: "temporary-contractor" })
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
      name: "temporary-contractor",
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

  it("returns null when deleting an unknown role", async () => {
    const repository = createUserRoleRepository(testDb.db)

    await expect(
      repository.deleteByID("37ff3776-a905-481e-8e53-444cc55f1af5")
    ).resolves.toBeNull()
  })
})
