import { beforeEach, describe, expect, it, vi } from "vitest"
import { viewerRole } from "@openvlp/types/model/rbac"

vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn()
    }
  }
}))

import { auth } from "../lib/auth.js"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createUserRoute } from "./users.js"

describe("user routes", () => {
  const authenticatedUser = createTestUser()
  const listedUser = {
    id: "r9yYWvWAKPdsNDMB3xDgmmMMBwPTCCB0",
    name: "Alice Example",
    email: "alice@example.com",
    emailVerified: true,
    image: null,
    roles: [viewerRole],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    username: "alice",
    displayUsername: "Alice"
  }
  const userService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth.api.userHasPermission).mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "users-unauthorized-request"
    const app = createTestApp({
      userRoute: createUserRoute(userService),
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
    const viewer = createTestUser({ role: "viewer" })

    vi.mocked(auth.api.userHasPermission).mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(viewer),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
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
    expect(userService.listAll).not.toHaveBeenCalled()
  })

  it("returns all users for authenticated requests", async () => {
    const requestId = "users-list-request"
    const users = [listedUser]

    userService.listAll.mockResolvedValue(users)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request("/api/users", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(userService.listAll).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: [
          {
            ...listedUser,
            roles: [viewerRole],
            createdAt: listedUser.createdAt.toISOString(),
            updatedAt: listedUser.updatedAt.toISOString()
          }
        ],
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns 404 when the user does not exist", async () => {
    const requestId = "users-not-found-request"
    const userId = "r9yYWvWAKPdsNDMB3xDgmmMMBwPTCCB0"

    userService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
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
      userRoute: createUserRoute(userService)
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
      data: {
        ...listedUser,
        roles: [viewerRole],
        createdAt: listedUser.createdAt.toISOString(),
        updatedAt: listedUser.updatedAt.toISOString()
      }
    })
  })

  it("returns 201 when creating a user", async () => {
    const requestId = "users-create-request"
    const payload = {
      name: "Alice Example",
      email: "alice@example.com",
      username: "alice",
      displayUsername: "Alice",
      password: "correct-horse-battery-staple"
    }

    userService.create.mockResolvedValue(listedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
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
    expect(userService.create).toHaveBeenCalledWith(payload)
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...listedUser,
        roles: [viewerRole],
        createdAt: listedUser.createdAt.toISOString(),
        updatedAt: listedUser.updatedAt.toISOString()
      }
    })
  })

  it("rejects invalid user create bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-invalid-create-body-request"
      },
      body: JSON.stringify({
        name: "",
        email: "not-an-email",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple"
      })
    })

    expect(response.status).toBe(400)
    expect(userService.create).not.toHaveBeenCalled()
  })

  it("updates a user by id", async () => {
    const requestId = "users-update-request"
    const userId = listedUser.id
    const payload = {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      password: "new-correct-horse-battery-staple"
    }
    const updatedUser = {
      ...listedUser,
      ...payload,
      username: listedUser.username,
      updatedAt: new Date("2026-02-03T04:05:06.000Z")
    }

    userService.updateByID.mockResolvedValue(updatedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
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
      data: {
        ...updatedUser,
        roles: [viewerRole],
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString()
      }
    })
  })

  it("updates a user by id without changing the password", async () => {
    const requestId = "users-update-without-password-request"
    const userId = listedUser.id
    const payload = {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: null
    }
    const updatedUser = {
      ...listedUser,
      ...payload,
      username: listedUser.username,
      updatedAt: new Date("2026-02-03T04:05:06.000Z")
    }

    userService.updateByID.mockResolvedValue(updatedUser)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
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
      data: {
        ...updatedUser,
        roles: [viewerRole],
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString()
      }
    })
  })

  it("rejects invalid user update bodies before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request(`/api/users/${listedUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-invalid-update-body-request"
      },
      body: JSON.stringify({
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "",
        image: null,
        password: "new-correct-horse-battery-staple"
      })
    })

    expect(response.status).toBe(400)
    expect(userService.updateByID).not.toHaveBeenCalled()
  })

  it("rejects empty passwords on user update", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request(`/api/users/${listedUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "users-empty-password-update-body-request"
      },
      body: JSON.stringify({
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: null,
        password: ""
      })
    })

    expect(response.status).toBe(400)
    expect(userService.updateByID).not.toHaveBeenCalled()
  })

  it("returns 404 when updating a missing user", async () => {
    const requestId = "users-update-not-found-request"
    const userId = listedUser.id

    userService.updateByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request(`/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify({
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: null,
        password: "new-correct-horse-battery-staple"
      })
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(userService.updateByID).toHaveBeenCalledWith(userId, {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: null,
      password: "new-correct-horse-battery-staple"
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `user with id ${userId} does not exist`
    })
  })
})
