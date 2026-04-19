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
    getByNames: vi.fn()
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("gets roles by name", async () => {
    const service = createRoleService({ roleRepository, logger })

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
    const service = createRoleService({ roleRepository, logger })

    roleRepository.list.mockResolvedValue([adminRole, viewerRole])

    await expect(service.listAll()).resolves.toEqual([adminRole, viewerRole])
    expect(roleRepository.list).toHaveBeenCalledOnce()
  })

  it("maps list failures to an HTTP 500", async () => {
    const service = createRoleService({ roleRepository, logger })

    roleRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list roles"
    } satisfies Partial<HTTPException>)
  })

  it("returns a role by id", async () => {
    const service = createRoleService({ roleRepository, logger })

    roleRepository.getByID.mockResolvedValue(viewerRole)

    await expect(service.getByID(viewerRole.id)).resolves.toEqual(viewerRole)
    expect(roleRepository.getByID).toHaveBeenCalledWith(viewerRole.id)
  })

  it("returns null when a role does not exist", async () => {
    const service = createRoleService({ roleRepository, logger })

    roleRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(viewerRole.id)).resolves.toBeNull()
  })

  it("maps get-by-id failures to an HTTP 500", async () => {
    const service = createRoleService({ roleRepository, logger })

    roleRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(viewerRole.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get role"
    } satisfies Partial<HTTPException>)
  })

  it("resolves role ids from persisted role names", async () => {
    const service = createRoleService({ roleRepository, logger })

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
    const service = createRoleService({ roleRepository, logger })

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
    const service = createRoleService({ roleRepository, logger })

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
    const service = createRoleService({ roleRepository, logger })

    roleRepository.getByNames.mockRejectedValue(new Error("db offline"))

    await expect(
      service.resolveRoleIdsFromNames([BuiltInRoleName.Viewer])
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to resolve role ids"
    } satisfies Partial<HTTPException>)
  })
})
