import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import { PermissionResource, PermissionVerb } from "@openvlp/types/model/rbac"

const { verifyPasswordHashMock } = vi.hoisted(() => ({
  verifyPasswordHashMock: vi.fn()
}))

vi.mock("../lib/argon2.js", () => ({
  verifyPasswordHash: verifyPasswordHashMock
}))

import { createAuthService } from "./auth.js"

describe("auth service", () => {
  const userProfileRepository = {
    getByID: vi.fn(),
    getByUsername: vi.fn()
  }
  const userSessionRepository = {
    getBySessionID: vi.fn(),
    create: vi.fn(),
    deleteBySessionID: vi.fn()
  }
  const userRoleRepository = {
    listPermissionsByUserID: vi.fn()
  }
  const logger = {
    debug: vi.fn(),
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
  const sessionHmacSecret =
    "012345678901234567890123456789012345678901234567890123456789"
  const sessionLifetimeHours = 12
  const storedSession = {
    id: "48f2e3a5-4560-4a47-85b6-137106940bbb",
    sessionId: "stored-session-id-digest",
    userId: enabledProfile.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-04-26T08:00:00.000Z"),
    expiresAt: new Date("2026-04-26T20:00:00.000Z")
  }

  function createService() {
    return createAuthService({
      userProfileRepository,
      userSessionRepository,
      userRoleRepository,
      sessionLifetimeHours,
      sessionHmacSecret,
      logger
    })
  }

  function hmacSessionId(sessionId: string): string {
    return createHmac("sha256", sessionHmacSecret)
      .update(sessionId)
      .digest("base64url")
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    verifyPasswordHashMock.mockResolvedValue(false)
  })

  it("returns true for valid enabled user credentials", async () => {
    const service = createService()

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
    const service = createService()

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
    const service = createService()

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
    const service = createService()
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
    const service = createService()
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
    const service = createService()
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

  it("creates sessions with an opaque token and stores only an HMAC digest", async () => {
    const service = createService()
    const now = new Date("2026-04-26T08:00:00.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)
    userProfileRepository.getByID.mockResolvedValue(enabledProfile)
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session
    }))

    const result = await service.createSession({
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0"
    })

    expect(result.sessionId).toEqual(expect.any(String))
    expect(result.sessionId).not.toBe(result.session.sessionId)
    expect(result.user).toEqual({
      id: enabledProfile.id,
      username: enabledProfile.username,
      displayName: enabledProfile.displayName,
      email: enabledProfile.email,
      enabled: enabledProfile.enabled
    })
    expect(userSessionRepository.create).toHaveBeenCalledWith({
      sessionId: hmacSessionId(result.sessionId),
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000)
    })
  })

  it("creates sessions with null source metadata when omitted", async () => {
    const service = createService()
    const now = new Date("2026-04-26T08:00:00.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)
    userProfileRepository.getByID.mockResolvedValue(enabledProfile)
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session
    }))

    const result = await service.createSession({
      userId: enabledProfile.id
    })

    expect(userSessionRepository.create).toHaveBeenCalledWith({
      sessionId: hmacSessionId(result.sessionId),
      userId: enabledProfile.id,
      sourceIp: null,
      userAgent: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000)
    })
  })

  it("creates a session for valid credentials without verifying the password twice", async () => {
    const service = createService()
    const now = new Date("2026-04-26T08:00:00.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)
    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile)
    verifyPasswordHashMock.mockResolvedValue(true)
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session
    }))

    const result = await service.createSessionForCredentials({
      username: enabledProfile.username,
      password: "correct-horse-battery-staple",
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0"
    })

    expect(result).toEqual({
      sessionId: expect.any(String),
      session: {
        id: storedSession.id,
        sessionId: hmacSessionId(result!.sessionId),
        userId: enabledProfile.id,
        sourceIp: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        createdAt: now,
        expiresAt: new Date(
          now.getTime() + sessionLifetimeHours * 60 * 60 * 1000
        )
      },
      user: {
        id: enabledProfile.id,
        username: enabledProfile.username,
        displayName: enabledProfile.displayName,
        email: enabledProfile.email,
        enabled: enabledProfile.enabled
      }
    })
    expect(verifyPasswordHashMock).toHaveBeenCalledOnce()
  })

  it("does not create a session for invalid credentials", async () => {
    const service = createService()

    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile)
    verifyPasswordHashMock.mockResolvedValue(false)

    await expect(
      service.createSessionForCredentials({
        username: enabledProfile.username,
        password: "wrong-password"
      })
    ).resolves.toBeNull()
    expect(userSessionRepository.create).not.toHaveBeenCalled()
  })

  it("maps session creation failures to an HTTP 500", async () => {
    const service = createService()
    const error = new Error("db offline")

    userSessionRepository.create.mockRejectedValue(error)

    await expect(
      service.createSession({
        userId: enabledProfile.id
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create user session"
    } satisfies Partial<HTTPException>)
  })

  it("validates active sessions and returns the public user profile", async () => {
    const service = createService()
    const sessionId = "public-session-token"

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"))
    userSessionRepository.getBySessionID.mockResolvedValue(storedSession)
    userProfileRepository.getByID.mockResolvedValue(enabledProfile)

    await expect(service.validateSession(sessionId)).resolves.toEqual({
      session: storedSession,
      user: {
        id: enabledProfile.id,
        username: enabledProfile.username,
        displayName: enabledProfile.displayName,
        email: enabledProfile.email,
        enabled: enabledProfile.enabled
      }
    })
    expect(userSessionRepository.getBySessionID).toHaveBeenCalledWith(
      hmacSessionId(sessionId)
    )
    expect(userProfileRepository.getByID).toHaveBeenCalledWith(
      storedSession.userId
    )
  })

  it("maps session lookup failures during validation to an HTTP 500", async () => {
    const service = createService()

    userSessionRepository.getBySessionID.mockRejectedValue(
      new Error("db offline")
    )

    await expect(
      service.validateSession("public-session-token")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to validate user session"
    } satisfies Partial<HTTPException>)
  })

  it("maps user lookup failures during validation to an HTTP 500", async () => {
    const service = createService()

    userSessionRepository.getBySessionID.mockResolvedValue(storedSession)
    userProfileRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(
      service.validateSession("public-session-token")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to validate user session"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when validating a missing session", async () => {
    const service = createService()

    userSessionRepository.getBySessionID.mockResolvedValue(null)

    await expect(
      service.validateSession("missing-session-token")
    ).resolves.toBeNull()
    expect(userProfileRepository.getByID).not.toHaveBeenCalled()
  })

  it("returns null when validating an expired session", async () => {
    const service = createService()
    const expiredSession = {
      ...storedSession,
      expiresAt: new Date("2026-04-26T07:59:59.000Z")
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"))
    userSessionRepository.getBySessionID.mockResolvedValue(expiredSession)

    await expect(
      service.validateSession("expired-session-token")
    ).resolves.toBeNull()
    expect(userProfileRepository.getByID).not.toHaveBeenCalled()
  })

  it("returns null when validating a session for a deleted user", async () => {
    const service = createService()

    userSessionRepository.getBySessionID.mockResolvedValue(storedSession)
    userProfileRepository.getByID.mockResolvedValue(null)

    await expect(
      service.validateSession("deleted-user-session-token")
    ).resolves.toBeNull()
  })

  it("returns null when validating a session for a disabled user", async () => {
    const service = createService()

    userSessionRepository.getBySessionID.mockResolvedValue(storedSession)
    userProfileRepository.getByID.mockResolvedValue({
      ...enabledProfile,
      enabled: false
    })

    await expect(
      service.validateSession("disabled-user-session-token")
    ).resolves.toBeNull()
  })

  it("revokes existing sessions by deleting the stored HMAC digest", async () => {
    const service = createService()
    const sessionId = "public-session-token"

    userSessionRepository.deleteBySessionID.mockResolvedValue(storedSession)

    await expect(service.revokeSession(sessionId)).resolves.toBe(true)
    expect(userSessionRepository.deleteBySessionID).toHaveBeenCalledWith(
      hmacSessionId(sessionId)
    )
  })

  it("returns false when revoking a missing session", async () => {
    const service = createService()

    userSessionRepository.deleteBySessionID.mockResolvedValue(null)

    await expect(service.revokeSession("missing-session-token")).resolves.toBe(
      false
    )
  })

  it("maps session revocation failures to an HTTP 500", async () => {
    const service = createService()

    userSessionRepository.deleteBySessionID.mockRejectedValue(
      new Error("db offline")
    )

    await expect(
      service.revokeSession("public-session-token")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to revoke user session"
    } satisfies Partial<HTTPException>)
  })

  it("returns true when the user has all requested permissions", async () => {
    const service = createService()

    userRoleRepository.listPermissionsByUserID.mockResolvedValue([
      {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      },
      {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Write
      },
      {
        resource: PermissionResource.Finding,
        verb: PermissionVerb.Read
      }
    ])

    await expect(
      service.userHasPermission(enabledProfile.id, {
        [PermissionResource.Asset]: [PermissionVerb.Read, PermissionVerb.Write],
        [PermissionResource.Finding]: [PermissionVerb.Read]
      })
    ).resolves.toBe(true)
    expect(userRoleRepository.listPermissionsByUserID).toHaveBeenCalledWith(
      enabledProfile.id
    )
  })

  it("returns false when the user lacks any requested permission", async () => {
    const service = createService()

    userRoleRepository.listPermissionsByUserID.mockResolvedValue([
      {
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read
      }
    ])

    await expect(
      service.userHasPermission(enabledProfile.id, {
        [PermissionResource.Asset]: [PermissionVerb.Read, PermissionVerb.Write]
      })
    ).resolves.toBe(false)
  })

  it("returns false when the user has no assigned permissions", async () => {
    const service = createService()

    userRoleRepository.listPermissionsByUserID.mockResolvedValue([])

    await expect(
      service.userHasPermission(enabledProfile.id, {
        [PermissionResource.Asset]: [PermissionVerb.Read]
      })
    ).resolves.toBe(false)
  })

  it("maps permission lookup failures to an HTTP 500", async () => {
    const service = createService()

    userRoleRepository.listPermissionsByUserID.mockRejectedValue(
      new Error("db offline")
    )

    await expect(
      service.userHasPermission(enabledProfile.id, {
        [PermissionResource.Asset]: [PermissionVerb.Read]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to check user permissions"
    } satisfies Partial<HTTPException>)
  })
})
