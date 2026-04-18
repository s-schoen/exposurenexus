import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import { createUserService } from "./user.js"
import type { User } from "@openvlp/types/model/user"
import type { AuthClient } from "../lib/auth.js"

type UserServiceAuth = {
  api: Pick<AuthClient["api"], "signUpEmail" | "setUserPassword">
}

describe("user service", () => {
  const userRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    updateByID: vi.fn()
  }
  const auth = {
    api: {
      signUpEmail: vi.fn<AuthClient["api"]["signUpEmail"]>(),
      setUserPassword: vi.fn<AuthClient["api"]["setUserPassword"]>()
    }
  } satisfies UserServiceAuth
  const logger = pino({ enabled: false })
  const user: User = {
    id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    name: "Alice Example",
    email: "alice@example.com",
    emailVerified: true,
    image: null,
    roles: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    username: "alice",
    displayUsername: "Alice"
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("lists all users from the repository", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const users: User[] = [user]

    userRepository.list.mockResolvedValue(users)

    await expect(service.listAll()).resolves.toEqual(users)
    expect(userRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, auth, logger })

    userRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list users"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user by id", async () => {
    const service = createUserService({ userRepository, auth, logger })

    userRepository.getByID.mockResolvedValue(user)

    await expect(service.getByID(user.id)).resolves.toEqual(user)
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("returns null when a user does not exist", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(userId)).resolves.toBeNull()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(userId)).rejects.toMatchObject({
      status: 500,
      message: "failed to get user"
    } satisfies Partial<HTTPException>)
  })

  it("creates a user through better-auth and returns the persisted user", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const createUser = {
      name: "Alice Example",
      email: "alice@example.com",
      username: "alice",
      displayUsername: "Alice",
      password: "correct-horse-battery-staple"
    }

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    userRepository.getByID.mockResolvedValue(user)

    await expect(service.create(createUser)).resolves.toEqual(user)
    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: createUser
    })
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("maps create conflicts to an HTTP 409", async () => {
    const service = createUserService({ userRepository, auth, logger })

    auth.api.signUpEmail.mockRejectedValue(
      Object.assign(new Error("email already exists"), { status: 409 })
    )

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple"
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "user already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps missing created users after signup to an HTTP 500", async () => {
    const service = createUserService({ userRepository, auth, logger })

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    userRepository.getByID.mockResolvedValue(null)

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple"
      })
    ).rejects.toThrow("failed to load created user")

    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("updates a user while preserving the immutable username", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const now = new Date("2026-02-03T04:05:06.000Z")
    const updatedUser = {
      ...user,
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      updatedAt: now
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    userRepository.getByID.mockResolvedValueOnce(user)
    userRepository.updateByID.mockResolvedValue(updatedUser)

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        password: "new-correct-horse-battery-staple"
      })
    ).resolves.toEqual(updatedUser)

    expect(userRepository.updateByID).toHaveBeenCalledWith(user.id, {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      updatedAt: now
    })
    expect(auth.api.setUserPassword).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        newPassword: "new-correct-horse-battery-staple"
      }
    })
  })

  it("updates profile fields without resetting the password when omitted", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const now = new Date("2026-02-03T04:05:06.000Z")
    const updatedUser = {
      ...user,
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: null,
      updatedAt: now
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    userRepository.getByID.mockResolvedValueOnce(user)
    userRepository.updateByID.mockResolvedValue(updatedUser)

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: null
      })
    ).resolves.toEqual(updatedUser)

    expect(userRepository.updateByID).toHaveBeenCalledWith(user.id, {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: null,
      updatedAt: now
    })
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
  })

  it("returns null when updating a missing user", async () => {
    const service = createUserService({ userRepository, auth, logger })

    userRepository.getByID.mockResolvedValue(null)

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: null,
        password: "new-correct-horse-battery-staple"
      })
    ).resolves.toBeNull()
    expect(userRepository.updateByID).not.toHaveBeenCalled()
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
  })

  it("maps update conflicts to an HTTP 409", async () => {
    const service = createUserService({ userRepository, auth, logger })

    userRepository.getByID.mockResolvedValue(user)
    userRepository.updateByID.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    )

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice@example.com",
        displayUsername: "Alice Updated",
        image: null,
        password: "new-correct-horse-battery-staple"
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "user already exists"
    } satisfies Partial<HTTPException>)
  })

  it("rolls back profile changes when password update fails", async () => {
    const service = createUserService({ userRepository, auth, logger })
    const now = new Date("2026-02-03T04:05:06.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    userRepository.getByID.mockResolvedValue(user)
    userRepository.updateByID
      .mockResolvedValueOnce({
        ...user,
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        updatedAt: now
      })
      .mockResolvedValueOnce(user)
    auth.api.setUserPassword.mockRejectedValue(new Error("auth offline"))

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        password: "new-correct-horse-battery-staple"
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update user"
    } satisfies Partial<HTTPException>)

    expect(userRepository.updateByID).toHaveBeenNthCalledWith(1, user.id, {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      updatedAt: now
    })
    expect(userRepository.updateByID).toHaveBeenNthCalledWith(2, user.id, {
      name: user.name,
      email: user.email,
      displayUsername: user.displayUsername,
      image: user.image,
      updatedAt: user.updatedAt
    })
  })
})
