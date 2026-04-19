import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds
} from "@openvlp/types/model/rbac"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createRequireDomainPermission } from "../middleware/auth.js"
import { createRoleRoute } from "./roles.js"

describe("role routes", () => {
  const authenticatedUser = createTestUser()
  const userHasPermission = vi.fn()
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission)
  }
  const listedRole = {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read }
    ]
  }
  const roleService = {
    listAll: vi.fn(),
    getByID: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userHasPermission.mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "roles-unauthorized-request"
    const app = createTestApp({
      roleRoute: createRoleRoute(roleService, routeDependencies),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/roles", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized"
    })
    expect(roleService.listAll).not.toHaveBeenCalled()
  })

  it("returns 403 for authenticated users without user read access", async () => {
    const requestId = "roles-forbidden-request"

    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      roleRoute: createRoleRoute(roleService, routeDependencies)
    })

    const response = await app.request("/api/roles", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      correlationId: requestId,
      status: 403,
      error: "Forbidden"
    })
    expect(userHasPermission).toHaveBeenCalledWith({
      body: {
        userId: authenticatedUser.id,
        permissions: {
          [PermissionResource.User]: [PermissionVerb.Read]
        }
      }
    })
    expect(roleService.listAll).not.toHaveBeenCalled()
  })

  it("returns all roles for authenticated requests", async () => {
    const requestId = "roles-list-request"

    roleService.listAll.mockResolvedValue([listedRole])

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      roleRoute: createRoleRoute(roleService, routeDependencies)
    })

    const response = await app.request("/api/roles", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(roleService.listAll).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: [listedRole],
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("rejects invalid role ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      roleRoute: createRoleRoute(roleService, routeDependencies)
    })

    const response = await app.request("/api/roles/not-a-uuid", {
      headers: {
        "X-Request-Id": "roles-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(roleService.getByID).not.toHaveBeenCalled()
  })

  it("returns 404 when the role does not exist", async () => {
    const requestId = "roles-not-found-request"
    const roleId = builtInRoleIds.viewer

    roleService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      roleRoute: createRoleRoute(roleService, routeDependencies)
    })

    const response = await app.request(`/api/roles/${roleId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(roleService.getByID).toHaveBeenCalledWith(roleId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `role with id ${roleId} does not exist`
    })
  })

  it("returns a role by id", async () => {
    const requestId = "roles-get-by-id-request"
    const roleId = listedRole.id

    roleService.getByID.mockResolvedValue(listedRole)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      roleRoute: createRoleRoute(roleService, routeDependencies)
    })

    const response = await app.request(`/api/roles/${roleId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(roleService.getByID).toHaveBeenCalledWith(roleId)
    expect(body).toEqual({
      correlationId: requestId,
      data: listedRole
    })
  })
})
