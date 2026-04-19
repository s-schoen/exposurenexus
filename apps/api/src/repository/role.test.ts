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
})
