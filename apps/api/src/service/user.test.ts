import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import type { User } from "../repository/user.js"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../repository/user.js", () => ({
  list: vi.fn(),
  getByID: vi.fn()
}))

import * as userRepository from "../repository/user.js"
import * as userService from "./user.js"

describe("user service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists all users from the repository", async () => {
    const users: User[] = [
      {
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
    ]

    vi.mocked(userRepository.list).mockResolvedValue(users)

    await expect(userService.listAll()).resolves.toEqual(users)
    expect(userRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    vi.mocked(userRepository.list).mockRejectedValue(new Error("db offline"))

    await expect(userService.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list users"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user by id", async () => {
    const user: User = {
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

    vi.mocked(userRepository.getByID).mockResolvedValue(user)

    await expect(userService.getByID(user.id)).resolves.toEqual(user)
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("returns null when a user does not exist", async () => {
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    vi.mocked(userRepository.getByID).mockResolvedValue(null)

    await expect(userService.getByID(userId)).resolves.toBeNull()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    vi.mocked(userRepository.getByID).mockRejectedValue(new Error("db offline"))

    await expect(userService.getByID(userId)).rejects.toMatchObject({
      status: 500,
      message: "failed to get user"
    } satisfies Partial<HTTPException>)
  })
})
