import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import type { User } from "../repository/user.js"
import { createUserService } from "./user.js"

describe("user service", () => {
  const userRepository = {
    list: vi.fn(),
    getByID: vi.fn()
  }
  const logger = pino({ enabled: false })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists all users from the repository", async () => {
    const service = createUserService({ userRepository, logger })
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

    userRepository.list.mockResolvedValue(users)

    await expect(service.listAll()).resolves.toEqual(users)
    expect(userRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, logger })

    userRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list users"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user by id", async () => {
    const service = createUserService({ userRepository, logger })
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

    userRepository.getByID.mockResolvedValue(user)

    await expect(service.getByID(user.id)).resolves.toEqual(user)
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("returns null when a user does not exist", async () => {
    const service = createUserService({ userRepository, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(userId)).resolves.toBeNull()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(userId)).rejects.toMatchObject({
      status: 500,
      message: "failed to get user"
    } satisfies Partial<HTTPException>)
  })
})
