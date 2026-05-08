import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { builtInRoleIds } from "@exposurenexus/types/model/rbac"
import {
  createListUsersQueryOptions,
  createUser,
  createUserByIDQueryOptions,
  updateUser
} from "./user.ts"
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile
} from "@exposurenexus/types/model/user"

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  })
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1]
  if (!init) {
    throw new Error("fetch was not called")
  }

  return init
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string)
}

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f"
const user: UserProfile = {
  id: userId,
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: [builtInRoleIds.viewer]
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("user api", () => {
  it("creates list query options and parses user lists", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [user]
        }
      })
    )

    const queryOptions = createListUsersQueryOptions()
    const users = await queryOptions.queryFn()

    expect(queryOptions.queryKey).toEqual(["users"])
    expect(users).toEqual([user])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("creates detail query options and parses user detail replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: user
      })
    )

    const queryOptions = createUserByIDQueryOptions(userId)
    const result = await queryOptions.queryFn()

    expect(queryOptions.queryKey).toEqual(["users", userId])
    expect(result).toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/users/${userId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("creates users with a JSON request body", async () => {
    const payload: CreateUserProfile = {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "correct horse battery staple",
      roleIds: [builtInRoleIds.viewer]
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: user
      })
    )

    await expect(createUser(payload)).resolves.toEqual(user)

    const headers = requestInit().headers as Headers
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual(payload)
  })

  it("updates users with a JSON request body", async () => {
    const payload: UpdateUserProfile = {
      displayName: "Alice Changed",
      email: "alice.changed@example.com",
      enabled: false,
      roleIds: [builtInRoleIds.editor]
    }
    const updatedUser = {
      ...user,
      ...payload,
      username: user.username
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: updatedUser
      })
    )

    await expect(updateUser(userId, payload)).resolves.toEqual(updatedUser)

    const headers = requestInit().headers as Headers
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/users/${userId}`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual(payload)
  })

  it("throws API errors from user requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "User request failed",
          reason: "database unavailable"
        },
        { status: 503 }
      )
    )

    await expect(createListUsersQueryOptions().queryFn()).rejects.toThrow(
      "User request failed"
    )
  })
})
