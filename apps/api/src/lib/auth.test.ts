import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestUser } from "../test/app.js"
import { ac, roles } from "./permissions.js"

const { adminMock, betterAuthMock, usernameMock } = vi.hoisted(() => ({
  adminMock: vi.fn(() => "admin-plugin"),
  betterAuthMock: vi.fn(),
  usernameMock: vi.fn(() => "username-plugin")
}))

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock
}))

vi.mock("better-auth/plugins", () => ({
  admin: adminMock,
  username: usernameMock
}))

vi.mock("../db/index.js", () => ({
  db: {},
  pool: {},
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock("../env.js", () => ({
  env: {
    AUTH_URL: "http://localhost:3000",
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789"
  }
}))

import { createAuth, createDefaultAdmin } from "./auth.js"

describe("auth factory", () => {
  const user = createTestUser()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a better-auth instance from injected dependencies", () => {
    const authInstance = {
      api: {
        signUpEmail: vi.fn(),
        userHasPermission: vi.fn()
      }
    }
    const pool = { end: vi.fn() }

    betterAuthMock.mockReturnValue(authInstance)

    expect(
      createAuth({
        pool: pool as never,
        authUrl: "http://localhost:3000",
        authSecret:
          "012345678901234567890123456789012345678901234567890123456789"
      })
    ).toBe(authInstance)

    expect(betterAuthMock).toHaveBeenCalledWith({
      database: pool,
      appName: "openvlp",
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false
      },
      baseURL: "http://localhost:3000",
      secret: "012345678901234567890123456789012345678901234567890123456789",
      plugins: ["username-plugin", "admin-plugin"]
    })
    expect(adminMock).toHaveBeenCalledWith({
      ac,
      roles,
      defaultRole: "viewer"
    })
    expect(usernameMock).toHaveBeenCalledOnce()
  })

  it("skips default admin creation when users already exist", async () => {
    const executeTakeFirstOrThrow = vi.fn().mockResolvedValue({ count: 1 })
    const select = vi.fn().mockReturnValue({ executeTakeFirstOrThrow })
    const selectFrom = vi.fn().mockReturnValue({
      select
    })
    const db = {
      selectFrom,
      updateTable: vi.fn(),
      fn: {
        countAll: vi.fn().mockReturnValue({
          as: vi.fn().mockReturnValue("count")
        })
      }
    }
    const auth = {
      api: {
        signUpEmail: vi.fn()
      }
    }
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    }

    await createDefaultAdmin({
      db: db as never,
      auth: auth as never,
      logger: logger as never
    })

    expect(auth.api.signUpEmail).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith("admin user already exists")
  })

  it("creates a default admin when no users exist", async () => {
    const executeTakeFirstOrThrow = vi.fn().mockResolvedValue({ count: 0 })
    const select = vi.fn().mockReturnValue({ executeTakeFirstOrThrow })
    const selectFrom = vi.fn().mockReturnValue({
      select
    })
    const db = {
      selectFrom,
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
              executeTakeFirstOrThrow: vi
                .fn()
                .mockResolvedValue({ id: user.id })
            })
          })
        })
      }),
      fn: {
        countAll: vi.fn().mockReturnValue({
          as: vi.fn().mockReturnValue("count")
        })
      }
    }
    const auth = {
      api: {
        signUpEmail: vi.fn().mockResolvedValue({ user })
      }
    }
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    }

    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-0000-0000-000000000000"
    )

    await createDefaultAdmin({
      db: db as never,
      auth: auth as never,
      logger: logger as never
    })

    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: {
        username: "admin",
        name: "Administrator",
        displayUsername: "Administrator",
        email: "admin@localhost.loc",
        password: "00000000-0000-0000-0000-000000000000"
      }
    })
    expect(db.updateTable).toHaveBeenCalledWith("user")
    expect(logger.info).toHaveBeenCalledWith(
      "created admin user: username=admin, password=00000000-0000-0000-0000-000000000000"
    )
  })
})
