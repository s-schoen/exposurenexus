import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb
} from "@openvlp/types/model/rbac"
import { createTestUser } from "../test/app.js"
import { ac } from "./permissions.js"

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

import {
  createAuth,
  createDefaultAdmin,
  createReloadableAuth,
  reloadAuthFromRoles
} from "./auth.js"

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
    const roles = {
      viewer: { authorize: vi.fn() },
      admin: { authorize: vi.fn() }
    }

    betterAuthMock.mockReturnValue(authInstance)

    expect(
      createAuth({
        pool: pool as never,
        authUrl: "http://localhost:3000",
        authSecret:
          "012345678901234567890123456789012345678901234567890123456789",
        roles: roles as never,
        defaultRole: BuiltInRoleName.Viewer
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
      defaultRole: BuiltInRoleName.Viewer
    })
    expect(usernameMock).toHaveBeenCalledOnce()
  })

  it("delegates auth operations through the current auth instance", async () => {
    const firstAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
        signUpEmail: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
        setRole: vi.fn().mockResolvedValue({ success: true }),
        setUserPassword: vi.fn().mockResolvedValue({ success: true }),
        userHasPermission: vi.fn().mockResolvedValue(true)
      },
      handler: vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    }
    const auth = createReloadableAuth(firstAuth as never)
    const headers = new Headers({ authorization: "Bearer token" })

    await expect(auth.api.getSession({ headers })).resolves.toBeNull()
    await expect(
      auth.api.signUpEmail({
        body: {
          username: "alice",
          name: "Alice Example",
          displayUsername: "Alice",
          email: "alice@example.com",
          password: "correct-horse-battery-staple"
        }
      })
    ).resolves.toEqual({ user: { id: "user-1" } })
    await expect(
      auth.api.setRole({
        body: {
          userId: "user-1",
          role: ["viewer"]
        }
      })
    ).resolves.toEqual({ success: true })
    await expect(
      auth.api.setUserPassword({
        body: {
          userId: "user-1",
          newPassword: "new-correct-horse-battery-staple"
        }
      })
    ).resolves.toEqual({ success: true })
    await expect(
      auth.api.userHasPermission({
        body: {
          userId: "user-1",
          permissions: { [PermissionResource.User]: [PermissionVerb.Read] }
        }
      })
    ).resolves.toBe(true)

    const response = await auth.handler(new Request("http://localhost/test"))

    expect(response.status).toBe(204)
    expect(firstAuth.api.getSession).toHaveBeenCalledWith({ headers })
    expect(firstAuth.api.signUpEmail).toHaveBeenCalledOnce()
    expect(firstAuth.api.setRole).toHaveBeenCalledOnce()
    expect(firstAuth.api.setUserPassword).toHaveBeenCalledOnce()
    expect(firstAuth.api.userHasPermission).toHaveBeenCalledOnce()
    expect(firstAuth.handler).toHaveBeenCalledOnce()
  })

  it("reloads to a new auth instance without recreating the wrapper", async () => {
    const firstAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
        signUpEmail: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
        setRole: vi.fn().mockResolvedValue({ success: true }),
        setUserPassword: vi.fn().mockResolvedValue({ success: true }),
        userHasPermission: vi.fn().mockResolvedValue(true)
      },
      handler: vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    }
    const secondAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: "user-2" },
          session: { userId: "user-2" }
        }),
        signUpEmail: vi.fn().mockResolvedValue({ user: { id: "user-2" } }),
        setRole: vi.fn().mockResolvedValue({ success: false, status: true }),
        setUserPassword: vi.fn().mockResolvedValue({ status: true }),
        userHasPermission: vi.fn().mockResolvedValue(false)
      },
      handler: vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    }
    const auth = createReloadableAuth(firstAuth as never)

    auth.reload(secondAuth as never)

    await expect(
      auth.api.getSession({ headers: new Headers() })
    ).resolves.toEqual({
      user: { id: "user-2" },
      session: { userId: "user-2" }
    })
    await expect(
      auth.api.userHasPermission({
        body: {
          userId: "user-2",
          permissions: { [PermissionResource.User]: [PermissionVerb.Read] }
        }
      })
    ).resolves.toBe(false)

    const response = await auth.handler(new Request("http://localhost/test"))

    expect(response.status).toBe(200)
    expect(firstAuth.api.getSession).not.toHaveBeenCalled()
    expect(firstAuth.api.userHasPermission).not.toHaveBeenCalled()
    expect(firstAuth.handler).not.toHaveBeenCalled()
    expect(secondAuth.api.getSession).toHaveBeenCalledOnce()
    expect(secondAuth.api.userHasPermission).toHaveBeenCalledOnce()
    expect(secondAuth.handler).toHaveBeenCalledOnce()
  })

  it("reloads better-auth from role definitions and applies the new client", async () => {
    const auth = createReloadableAuth({
      api: {
        getSession: vi.fn().mockResolvedValue(null),
        signUpEmail: vi.fn(),
        setRole: vi.fn(),
        setUserPassword: vi.fn(),
        userHasPermission: vi.fn().mockResolvedValue(true)
      },
      handler: vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    } as never)
    const pool = { end: vi.fn() }
    const runtimeRoles = [
      {
        id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
        name: "analyst",
        permissions: [{ resource: "asset", verb: "read" }]
      }
    ]
    const reloadedAuth = {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
        signUpEmail: vi.fn(),
        setRole: vi.fn(),
        setUserPassword: vi.fn(),
        userHasPermission: vi.fn().mockResolvedValue(false)
      },
      handler: vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    }

    betterAuthMock.mockReturnValue(reloadedAuth)

    await reloadAuthFromRoles({
      auth,
      listRoles: vi.fn().mockResolvedValue(runtimeRoles),
      pool: pool as never,
      authUrl: "http://localhost:3000",
      authSecret:
        "012345678901234567890123456789012345678901234567890123456789",
      defaultRole: BuiltInRoleName.Viewer
    })

    await expect(
      auth.api.userHasPermission({
        body: {
          userId: "user-1",
          permissions: { [PermissionResource.Asset]: [PermissionVerb.Read] }
        }
      })
    ).resolves.toBe(false)
    expect(adminMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.objectContaining({
          analyst: expect.objectContaining({
            authorize: expect.any(Function)
          })
        }),
        defaultRole: BuiltInRoleName.Viewer
      })
    )
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
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue({
          executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: user.id })
        })
      })
    })
    const db = {
      selectFrom,
      updateTable: vi.fn().mockReturnValue({
        set
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
    expect(set).toHaveBeenCalledWith({ role: BuiltInRoleName.Admin })
    expect(logger.info).toHaveBeenCalledWith(
      "created admin user: username=admin, password=00000000-0000-0000-0000-000000000000"
    )
  })
})
