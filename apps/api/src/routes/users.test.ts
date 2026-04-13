import { beforeEach, describe, expect, it, vi } from "vitest"
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
    id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    name: "Alice Example",
    email: "alice@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    username: "alice",
    displayUsername: "Alice"
  }
  const userService = {
    listAll: vi.fn(),
    getByID: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
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

  it("rejects invalid user ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(authenticatedUser),
      requireAuth: requireAuthenticatedUser,
      userRoute: createUserRoute(userService)
    })

    const response = await app.request("/api/users/not-a-uuid", {
      headers: {
        "X-Request-Id": "users-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(userService.getByID).not.toHaveBeenCalled()
  })

  it("returns 404 when the user does not exist", async () => {
    const requestId = "users-not-found-request"
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

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
        createdAt: listedUser.createdAt.toISOString(),
        updatedAt: listedUser.updatedAt.toISOString()
      }
    })
  })
})
