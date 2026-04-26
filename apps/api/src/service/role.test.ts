import { describe, expect, it, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
  type Role
} from "@openvlp/types/model/rbac"
import { createRoleService } from "./role.js"

describe("role service", () => {
  const roleRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByIDs: vi.fn(),
    getByNames: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    hasUsersWithRoleID: vi.fn()
  }
  const logger = pino({ enabled: false })
  const viewerRole: Role = {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read }
    ]
  }
  const adminRole: Role = {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [
      { resource: PermissionResource.User, verb: PermissionVerb.Write }
    ]
  }
  const analystRole: Role = {
    id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: "analyst",
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read }
    ]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    roleRepository.hasUsersWithRoleID.mockResolvedValue(false)
  })

  it("gets roles by name", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByNames.mockResolvedValue([viewerRole, adminRole])

    await expect(
      service.getByNames([BuiltInRoleName.Viewer, BuiltInRoleName.Admin])
    ).resolves.toEqual([viewerRole, adminRole])
    expect(roleRepository.getByNames).toHaveBeenCalledWith([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Admin
    ])
  })

  it("lists all roles", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.list.mockResolvedValue([adminRole, viewerRole])

    await expect(service.listAll()).resolves.toEqual([adminRole, viewerRole])
    expect(roleRepository.list).toHaveBeenCalledOnce()
  })

  it("maps list failures to an HTTP 500", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list roles"
    } satisfies Partial<HTTPException>)
  })

  it("returns a role by id", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByID.mockResolvedValue(viewerRole)

    await expect(service.getByID(viewerRole.id)).resolves.toEqual(viewerRole)
    expect(roleRepository.getByID).toHaveBeenCalledWith(viewerRole.id)
  })

  it("returns null when a role does not exist", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(viewerRole.id)).resolves.toBeNull()
  })

  it("maps get-by-id failures to an HTTP 500", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(viewerRole.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get role"
    } satisfies Partial<HTTPException>)
  })

  it("resolves role ids from persisted role names", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByNames.mockResolvedValue([viewerRole, adminRole])

    await expect(
      service.resolveRoleIdsFromNames([
        BuiltInRoleName.Viewer,
        BuiltInRoleName.Admin
      ])
    ).resolves.toEqual([builtInRoleIds.viewer, builtInRoleIds.admin])
    expect(roleRepository.getByNames).toHaveBeenCalledWith([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Admin
    ])
  })

  it("requires known role ids and resolves them to role names", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByIDs.mockResolvedValue([adminRole, viewerRole])

    await expect(
      service.requireRoleNamesFromIds([
        builtInRoleIds.admin,
        builtInRoleIds.viewer,
        builtInRoleIds.admin
      ])
    ).resolves.toEqual([BuiltInRoleName.Admin, BuiltInRoleName.Viewer])
    expect(roleRepository.getByIDs).toHaveBeenCalledWith([
      builtInRoleIds.admin,
      builtInRoleIds.viewer
    ])
  })

  it("rejects unknown role ids with an HTTP 400", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByIDs.mockResolvedValue([viewerRole])

    await expect(
      service.requireRoleNamesFromIds([
        builtInRoleIds.viewer,
        "0671d03d-57f1-49c8-8f62-5de6ed0924db"
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: "unknown role ids: 0671d03d-57f1-49c8-8f62-5de6ed0924db"
    } satisfies Partial<HTTPException>)
  })

  it("maps role resolution failures to an HTTP 500", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByNames.mockRejectedValue(new Error("db offline"))

    await expect(
      service.resolveRoleIdsFromNames([BuiltInRoleName.Viewer])
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to resolve role ids"
    } satisfies Partial<HTTPException>)
  })

  it("updates a custom role", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })
    const updatedRole = {
      ...analystRole,
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write }
      ]
    }

    roleRepository.updateByID.mockResolvedValue(updatedRole)

    await expect(
      service.updateByID(analystRole.id, {
        name: "security-analyst",
        permissions: updatedRole.permissions
      })
    ).resolves.toEqual(updatedRole)
  })

  it("maps duplicate role name updates to an HTTP 409", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.updateByID.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    )

    await expect(
      service.updateByID(analystRole.id, {
        name: BuiltInRoleName.Viewer,
        permissions: analystRole.permissions
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "role already exists"
    } satisfies Partial<HTTPException>)
  })

  it("rejects attempts to modify built-in roles", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    await expect(
      service.updateByID(builtInRoleIds.viewer, {
        name: "updated-viewer",
        permissions: []
      })
    ).rejects.toMatchObject({
      status: 403,
      message: "built-in roles cannot be modified"
    } satisfies Partial<HTTPException>)

    expect(roleRepository.updateByID).not.toHaveBeenCalled()
  })

  it("deletes a custom role", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByID.mockResolvedValue(analystRole)
    roleRepository.deleteByID.mockResolvedValue(analystRole)

    await expect(service.deleteByID(analystRole.id)).resolves.toEqual(
      analystRole
    )
    expect(roleRepository.hasUsersWithRoleID).toHaveBeenCalledWith(
      analystRole.id
    )
  })

  it("rejects trying to delete a built-in role", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    await expect(
      service.deleteByID(builtInRoleIds.admin)
    ).rejects.toMatchObject({
      status: 403,
      message: "built-in roles cannot be modified"
    } satisfies Partial<HTTPException>)

    expect(roleRepository.deleteByID).not.toHaveBeenCalled()
  })

  it("rejects deleting a role that is still assigned to users", async () => {
    const service = createRoleService({
      roleRepository,
      logger
    })

    roleRepository.getByID.mockResolvedValue(analystRole)
    roleRepository.hasUsersWithRoleID.mockResolvedValue(true)

    await expect(service.deleteByID(analystRole.id)).rejects.toMatchObject({
      status: 409,
      message: `role ${analystRole.name} is still assigned to users`
    } satisfies Partial<HTTPException>)

    expect(roleRepository.deleteByID).not.toHaveBeenCalled()
  })
})
