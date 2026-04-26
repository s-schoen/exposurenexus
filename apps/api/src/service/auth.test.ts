import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"

const { verifyPasswordHashMock } = vi.hoisted(() => ({
  verifyPasswordHashMock: vi.fn()
}))

vi.mock("../lib/argon2.js", () => ({
  verifyPasswordHash: verifyPasswordHashMock
}))

import { createAuthService } from "./auth.js"

describe("auth service", () => {
  const userProfileRepository = {
    getByUsername: vi.fn()
  }
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  } as unknown as Logger
  const enabledProfile = {
    id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    passwordHash: "argon2-password-hash"
  }

  beforeEach(() => {
    vi.clearAllMocks()
    verifyPasswordHashMock.mockResolvedValue(false)
  })

  it("returns true for valid enabled user credentials", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile)
    verifyPasswordHashMock.mockResolvedValue(true)

    await expect(
      service.checkCredentials("alice", "correct-horse-battery-staple")
    ).resolves.toBe(true)
    expect(userProfileRepository.getByUsername).toHaveBeenCalledWith("alice")
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple",
      enabledProfile.passwordHash
    )
  })

  it("returns false for a missing username after verifying a dummy hash", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockResolvedValue(null)

    await expect(
      service.checkCredentials("missing-user", "wrong-password")
    ).resolves.toBe(false)
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(
        /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/
      )
    )
  })

  it("returns false for an incorrect password", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })

    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile)
    verifyPasswordHashMock.mockResolvedValue(false)

    await expect(
      service.checkCredentials("alice", "wrong-password")
    ).resolves.toBe(false)
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "wrong-password",
      enabledProfile.passwordHash
    )
  })

  it("returns false for disabled users after verifying the stored hash", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })
    const disabledProfile = {
      ...enabledProfile,
      enabled: false
    }

    userProfileRepository.getByUsername.mockResolvedValue(disabledProfile)
    verifyPasswordHashMock.mockResolvedValue(true)

    await expect(
      service.checkCredentials("alice", "correct-horse-battery-staple")
    ).resolves.toBe(false)
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple",
      disabledProfile.passwordHash
    )
  })

  it("returns false when the stored password hash cannot be verified", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })
    const profileWithMalformedHash = {
      ...enabledProfile,
      passwordHash: "not-a-password-hash"
    }

    userProfileRepository.getByUsername.mockResolvedValue(
      profileWithMalformedHash
    )
    verifyPasswordHashMock.mockResolvedValue(false)

    await expect(
      service.checkCredentials("alice", "correct-horse-battery-staple")
    ).resolves.toBe(false)
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple",
      profileWithMalformedHash.passwordHash
    )
  })

  it("logs and maps repository failures to an HTTP 500", async () => {
    const service = createAuthService({
      userProfileRepository,
      logger
    })
    const error = new Error("db offline")

    userProfileRepository.getByUsername.mockRejectedValue(error)

    await expect(
      service.checkCredentials("alice", "correct-horse-battery-staple")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to check user credentials"
    } satisfies Partial<HTTPException>)
    expect(logger.error).toHaveBeenCalledWith(
      error,
      "failed to check user credentials"
    )
    expect(verifyPasswordHashMock).not.toHaveBeenCalled()
  })
})
