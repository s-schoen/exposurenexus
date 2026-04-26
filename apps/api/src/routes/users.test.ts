import { beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionResource, PermissionVerb } from "@openvlp/types/model/rbac"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createRequireDomainPermission } from "../middleware/auth.js"
import { createUserRoute } from "./users.js"

describe("user routes", () => {
  const authenticatedUser = createTestUser()
  const userHasPermission = vi.fn()
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission)
  }
  const listedUser = {
    id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true
  }
  const userService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userHasPermission.mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "users-unauthorized-request"
    const app = createTestApp({
      userRoute: createUserRoute(userService, routeDependencies),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/users", {
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
    expect(userService.listAll).not.toHaveBeenCalled()
  })

  it("returns 403 for authenticated users without admin user-management access", async () => {
    const requestId = "users-forbidden-request"
    const viewer = createTestUser()

    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(viewer),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request("/api/users", {
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
    expect(userHasPermission).toHaveBeenCalledWith(viewer.id, {
      [PermissionResource.User]: [PermissionVerb.Read]
    })
    expect(userService.listAll).not.toHaveBeenCalled()
  })

  it("returns all users for authenticated requests", async () => {
    const requestId = "users-list-request"
    const users = [listedUser]

    userService.listAll.mockResolvedValue(users)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request("/api/users", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userHasPermission).toHaveBeenCalledWith(authenticatedUser.id, {
      [PermissionResource.User]: [PermissionVerb.Read]
    })
    expect(userService.listAll).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: [listedUser],
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns 404 when the user does not exist", async () => {
    const requestId = "users-not-found-request"
    const userId = "4fa42fa9-3ff9-48d4-9150-34681f393885"

    userService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${userId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(userService.getByID).toHaveBeenCalledWith(userId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `user with id ${userId} does not exist`
    })
  })

  it("returns a user by id", async () => {
    const requestId = "users-get-by-id-request"
    const userId = listedUser.id

    userService.getByID.mockResolvedValue(listedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${userId}`, {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userService.getByID).toHaveBeenCalledWith(userId)
    expect(body).toEqual({
      correlationId: requestId,
      data: listedUser
    })
  })

  it("returns 201 when creating a user", async () => {
    const requestId = "users-create-request"
    const payload = {
      username: "alice",
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: true,
      password: "correct-horse-battery-staple"
    }

    userService.create.mockResolvedValue(listedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(userHasPermission).toHaveBeenCalledWith(authenticatedUser.id, {
      [PermissionResource.User]: [PermissionVerb.Write]
    })
    expect(userService.create).toHaveBeenCalledWith(payload)
    expect(body).toEqual({
      correlationId: requestId,
      data: listedUser
    })
  })

  it("rejects invalid user create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-invalid-create-body-request"
      },
      body: JSON.stringify({
        username: "alice",
        displayName: "Alice Example",
        email: "not-an-email",
        enabled: true,
        password: ""
      })
    })

    expect(response.status).toBe(400)
    expect(userService.create).not.toHaveBeenCalled()
  })

  it("updates a user by id", async () => {
    const requestId = "users-update-request"
    const userId = listedUser.id
    const payload = {
      displayName: "Alice Updated",
      email: "alice.updated@example.com",
      enabled: false,
      password: "new-correct-horse-battery-staple"
    }
    const updatedUser = {
      ...listedUser,
      displayName: payload.displayName,
      email: payload.email,
      enabled: payload.enabled
    }

    userService.updateByID.mockResolvedValue(updatedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userHasPermission).toHaveBeenCalledWith(authenticatedUser.id, {
      [PermissionResource.User]: [PermissionVerb.Write]
    })
    expect(userService.updateByID).toHaveBeenCalledWith(userId, payload)
    expect(body).toEqual({
      correlationId: requestId,
      data: updatedUser
    })
  })

  it("updates a user by id without changing the password", async () => {
    const requestId = "users-update-without-password-request"
    const userId = listedUser.id
    const payload = {
      displayName: "Alice Updated",
      email: "alice.updated@example.com",
      enabled: true
    }
    const updatedUser = {
      ...listedUser,
      ...payload
    }

    userService.updateByID.mockResolvedValue(updatedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userService.updateByID).toHaveBeenCalledWith(userId, payload)
    expect(body).toEqual({
      correlationId: requestId,
      data: updatedUser
    })
  })

  it("rejects invalid user update bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${listedUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-invalid-update-body-request"
      },
      body: JSON.stringify({
        email: "not-an-email"
      })
    })

    expect(response.status).toBe(400)
    expect(userService.updateByID).not.toHaveBeenCalled()
  })

  it("rejects empty passwords on user update", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${listedUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-empty-password-update-body-request"
      },
      body: JSON.stringify({
        password: ""
      })
    })

    expect(response.status).toBe(400)
    expect(userService.updateByID).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid user ids", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request("/api/users/not-a-user-id", {
      headers: {
        "X-Request-Id": "users-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(userService.getByID).not.toHaveBeenCalled()
  })

  it("returns 404 when updating a missing user", async () => {
    const requestId = "users-update-not-found-request"
    const userId = listedUser.id
    const payload = {
      displayName: "Alice Updated",
      email: "alice.updated@example.com",
      enabled: true,
      password: "new-correct-horse-battery-staple"
    }

    userService.updateByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService, routeDependencies)
    })

    const response = await app.request(`/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(userService.updateByID).toHaveBeenCalledWith(userId, payload)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `user with id ${userId} does not exist`
    })
  })
})
