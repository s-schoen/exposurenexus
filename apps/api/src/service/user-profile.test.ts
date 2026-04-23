import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import { createUserProfileService } from "./user-profile.js"

describe("user profile service", () => {
  const userProfileRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByUsername: vi.fn()
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

    await expect(service.getByUsername(secondProfile.username)).resolves.toEqual(
      {
        id: secondProfile.id,
        username: secondProfile.username,
        displayName: secondProfile.displayName,
        email: secondProfile.email,
        enabled: secondProfile.enabled
      }
    )
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

    userProfileRepository.getByUsername.mockRejectedValue(new Error("db offline"))

    await expect(service.getByUsername("alice")).rejects.toMatchObject({
      status: 500,
      message: "failed to get user profile"
    } satisfies Partial<HTTPException>)
  })
})
