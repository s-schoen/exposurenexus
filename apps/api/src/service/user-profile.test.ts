import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"

const { hashPlaintextPasswordMock } = vi.hoisted(() => ({
  hashPlaintextPasswordMock: vi.fn()
}))

vi.mock("../lib/argon2.js", () => ({
  hashPlaintextPassword: hashPlaintextPasswordMock
}))

import { createUserProfileService } from "./user-profile.js"

describe("user profile service", () => {
  const userProfileRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByUsername: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
  const logger = pino({ enabled: false })
  const firstProfile = {
    id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    passwordHash: "hash-alice"
  }
  const secondProfile = {
    id: "4fa42fa9-3ff9-48d4-9150-34681f393885",
    username: "bob",
    displayName: "Bob Example",
    email: "bob@example.com",
    enabled: false,
    passwordHash: "hash-bob"
  }

  beforeEach(() => {
    vi.clearAllMocks()
    hashPlaintextPasswordMock.mockResolvedValue("argon2-password-hash")
  })

  it("lists all user profiles without exposing password hashes", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.list.mockResolvedValue([firstProfile, secondProfile])

    await expect(service.listAll()).resolves.toEqual([
      {
        id: firstProfile.id,
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled
      },
      {
        id: secondProfile.id,
        username: secondProfile.username,
        displayName: secondProfile.displayName,
        email: secondProfile.email,
        enabled: secondProfile.enabled
      }
    ])
    expect(userProfileRepository.list).toHaveBeenCalledOnce()
  })

  it("maps list failures to an HTTP 500", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list user profiles"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user profile by id without exposing the password hash", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByID.mockResolvedValue(firstProfile)

    await expect(service.getByID(firstProfile.id)).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled
    })
    expect(userProfileRepository.getByID).toHaveBeenCalledWith(firstProfile.id)
  })

  it("returns null when a user profile id does not exist", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f"

    userProfileRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(userProfileId)).resolves.toBeNull()
  })

  it("maps get-by-id failures to an HTTP 500", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f"

    userProfileRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(userProfileId)).rejects.toMatchObject({
      status: 500,
      message: "failed to get user profile"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user profile by username without exposing the password hash", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockResolvedValue(secondProfile)

    await expect(
      service.getByUsername(secondProfile.username)
    ).resolves.toEqual({
      id: secondProfile.id,
      username: secondProfile.username,
      displayName: secondProfile.displayName,
      email: secondProfile.email,
      enabled: secondProfile.enabled
    })
    expect(userProfileRepository.getByUsername).toHaveBeenCalledWith(
      secondProfile.username
    )
  })

  it("returns null when a user profile username does not exist", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockResolvedValue(null)

    await expect(service.getByUsername("missing-user")).resolves.toBeNull()
  })

  it("maps get-by-username failures to an HTTP 500", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockRejectedValue(
      new Error("db offline")
    )

    await expect(service.getByUsername("alice")).rejects.toMatchObject({
      status: 500,
      message: "failed to get user profile"
    } satisfies Partial<HTTPException>)
  })

  it("creates a user profile with a hashed password", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const createdProfile = {
      ...firstProfile,
      passwordHash: "argon2-password-hash"
    }

    userProfileRepository.create.mockResolvedValue(createdProfile)

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        password: "correct-horse-battery-staple"
      })
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled
    })
    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple"
    )
    expect(userProfileRepository.create).toHaveBeenCalledWith({
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      passwordHash: "argon2-password-hash"
    })
  })

  it("maps create conflicts to an HTTP 409", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    )

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        password: "correct-horse-battery-staple"
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "user profile already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps create failures to an HTTP 500", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    hashPlaintextPasswordMock.mockRejectedValue(new Error("crypto unavailable"))

    await expect(
      service.create({
        username: firstProfile.username,
        displayName: firstProfile.displayName,
        email: firstProfile.email,
        enabled: firstProfile.enabled,
        password: "correct-horse-battery-staple"
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create user profile"
    } satisfies Partial<HTTPException>)
  })

  it("updates a user profile by merging partial fields", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const updatedProfile = {
      ...firstProfile,
      displayName: "Alice Updated",
      enabled: false
    }

    userProfileRepository.getByID.mockResolvedValue(firstProfile)
    userProfileRepository.update.mockResolvedValue(updatedProfile)

    await expect(
      service.updateByID(firstProfile.id, {
        displayName: "Alice Updated",
        enabled: false
      })
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: "Alice Updated",
      email: firstProfile.email,
      enabled: false
    })
    expect(hashPlaintextPasswordMock).not.toHaveBeenCalled()
    expect(userProfileRepository.update).toHaveBeenCalledWith(firstProfile.id, {
      username: firstProfile.username,
      displayName: "Alice Updated",
      email: firstProfile.email,
      enabled: false,
      passwordHash: firstProfile.passwordHash
    })
  })

  it("updates a user profile password when provided", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const updatedProfile = {
      ...firstProfile,
      passwordHash: "argon2-password-hash"
    }

    userProfileRepository.getByID.mockResolvedValue(firstProfile)
    userProfileRepository.update.mockResolvedValue(updatedProfile)

    await expect(
      service.updateByID(firstProfile.id, {
        password: "new-correct-horse-battery-staple"
      })
    ).resolves.toEqual({
      id: firstProfile.id,
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled
    })
    expect(hashPlaintextPasswordMock).toHaveBeenCalledWith(
      "new-correct-horse-battery-staple"
    )
    expect(userProfileRepository.update).toHaveBeenCalledWith(firstProfile.id, {
      username: firstProfile.username,
      displayName: firstProfile.displayName,
      email: firstProfile.email,
      enabled: firstProfile.enabled,
      passwordHash: "argon2-password-hash"
    })
  })

  it("returns null when updating a user profile that does not exist", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })
    const userProfileId = "ef2fb643-53e3-4b0c-9b68-253d0dd43f8f"

    userProfileRepository.getByID.mockResolvedValue(null)

    await expect(
      service.updateByID(userProfileId, {
        displayName: "Missing User"
      })
    ).resolves.toBeNull()
    expect(userProfileRepository.update).not.toHaveBeenCalled()
  })

  it("returns null when update no longer finds the user profile", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByID.mockResolvedValue(firstProfile)
    userProfileRepository.update.mockResolvedValue(null)

    await expect(
      service.updateByID(firstProfile.id, {
        displayName: "Alice Updated"
      })
    ).resolves.toBeNull()
  })

  it("maps update conflicts to an HTTP 409", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByID.mockResolvedValue(firstProfile)
    userProfileRepository.update.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    )

    await expect(
      service.updateByID(firstProfile.id, {
        email: secondProfile.email
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "user profile already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps update failures to an HTTP 500", async () => {
    const service = createUserProfileService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByID.mockResolvedValue(firstProfile)
    userProfileRepository.update.mockRejectedValue(new Error("db offline"))

    await expect(
      service.updateByID(firstProfile.id, {
        displayName: "Alice Updated"
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update user profile"
    } satisfies Partial<HTTPException>)
  })
})
