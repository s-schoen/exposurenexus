import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import {
  BuiltInRoleName,
  builtInRoleIds,
  type Role
} from "@openvlp/types/model/rbac"
import { createUserService } from "./user.js"
import type { User } from "@openvlp/types/model/user"
import type { AuthClient } from "../lib/auth.js"

type UserServiceAuth = {
  api: Pick<
    AuthClient["api"],
    "signUpEmail" | "setRole" | "setUserPassword" | "removeUser"
  >
}

describe("user service", () => {
  type PersistedUser = Omit<User, "roleIds"> & {
    roleNames: string[]
  }

  const userRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    updateByID: vi.fn()
  }
  const roleService = {
    getByNames: vi.fn(),
    requireRoleNamesFromIds: vi.fn()
  }
  const auth = {
    api: {
      signUpEmail: vi.fn<AuthClient["api"]["signUpEmail"]>(),
      setRole: vi.fn<AuthClient["api"]["setRole"]>(),
      setUserPassword: vi.fn<AuthClient["api"]["setUserPassword"]>(),
      removeUser: vi.fn<AuthClient["api"]["removeUser"]>()
    }
  } satisfies UserServiceAuth
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  } as unknown as Logger
  const user: User = {
    id: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    name: "Alice Example",
    email: "alice@example.com",
    emailVerified: true,
    image: null,
    roleIds: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    username: "alice",
    displayUsername: "Alice"
  }
  const viewerRole: Role = {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: []
  }
  const editorRole: Role = {
    id: builtInRoleIds.editor,
    name: BuiltInRoleName.Editor,
    permissions: []
  }
  const persistedUser: PersistedUser = {
    ...user,
    roleNames: []
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
  })

  it("lists all users from the repository", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
    const users: User[] = [user]

    userRepository.list.mockResolvedValue([persistedUser])
    roleService.getByNames.mockResolvedValue([])

    await expect(service.listAll()).resolves.toEqual(users)
    expect(userRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    userRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list users"
    } satisfies Partial<HTTPException>)
  })

  it("returns a user by id", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    userRepository.getByID.mockResolvedValue({
      ...persistedUser,
      roleNames: [BuiltInRoleName.Viewer]
    })
    roleService.getByNames.mockResolvedValue([viewerRole])

    await expect(service.getByID(user.id)).resolves.toEqual({
      ...user,
      roleIds: [builtInRoleIds.viewer]
    })
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("returns null when a user does not exist", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(userId)).resolves.toBeNull()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
    const userId = "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f"

    userRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(userId)).rejects.toMatchObject({
      status: 500,
      message: "failed to get user"
    } satisfies Partial<HTTPException>)
  })

  it("creates a user through better-auth and returns the persisted user", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
    const createUser = {
      name: "Alice Example",
      email: "alice@example.com",
      username: "alice",
      displayUsername: "Alice",
      password: "correct-horse-battery-staple",
      roleIds: [builtInRoleIds.viewer]
    }

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    auth.api.setRole.mockResolvedValue({ user: { id: user.id } })
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer
    ])
    userRepository.getByID.mockResolvedValue({
      ...persistedUser,
      roleNames: [BuiltInRoleName.Viewer]
    })
    roleService.getByNames.mockResolvedValue([viewerRole])

    await expect(service.create(createUser)).resolves.toEqual({
      ...user,
      roleIds: [builtInRoleIds.viewer]
    })
    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: createUser.name,
        email: createUser.email,
        username: createUser.username,
        displayUsername: createUser.displayUsername,
        password: createUser.password
      }
    })
    expect(roleService.requireRoleNamesFromIds).toHaveBeenCalledWith([
      builtInRoleIds.viewer
    ])
    expect(auth.api.setRole).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        role: [BuiltInRoleName.Viewer]
      }
    })
    expect(userRepository.getByID).toHaveBeenCalledWith(user.id)
  })

  it("rejects unknown role ids before creating a user", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    roleService.requireRoleNamesFromIds.mockRejectedValue(
      new HTTPException(400, {
        message: "unknown role ids: 0671d03d-57f1-49c8-8f62-5de6ed0924db"
      })
    )

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple",
        roleIds: ["0671d03d-57f1-49c8-8f62-5de6ed0924db"]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "unknown role ids: 0671d03d-57f1-49c8-8f62-5de6ed0924db"
    } satisfies Partial<HTTPException>)

    expect(auth.api.signUpEmail).not.toHaveBeenCalled()
  })

  it("maps create conflicts to an HTTP 409", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

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
    const service = createUserService({ userRepository, roleService, auth, logger })

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    auth.api.removeUser.mockResolvedValue({ success: true })
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
    expect(auth.api.removeUser).toHaveBeenCalledWith({
      body: {
        userId: user.id
      }
    })
  })

  it("removes the created user when role assignment fails", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer
    ])
    auth.api.setRole.mockRejectedValue(new Error("auth offline"))
    auth.api.removeUser.mockResolvedValue({ success: true })

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple",
        roleIds: [builtInRoleIds.viewer]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create user"
    } satisfies Partial<HTTPException>)

    expect(auth.api.removeUser).toHaveBeenCalledWith({
      body: {
        userId: user.id
      }
    })
  })

  it("removes the created user when role assignment reports failure", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer
    ])
    auth.api.setRole.mockResolvedValue({} as never)
    auth.api.removeUser.mockResolvedValue({ success: true })

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple",
        roleIds: [builtInRoleIds.viewer]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create user"
    } satisfies Partial<HTTPException>)

    expect(auth.api.removeUser).toHaveBeenCalledWith({
      body: {
        userId: user.id
      }
    })
  })

  it("logs rollback failures when removing a partially created user fails", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

    auth.api.signUpEmail.mockResolvedValue({ user: { id: user.id } })
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer
    ])
    auth.api.setRole.mockRejectedValue(new Error("auth offline"))
    auth.api.removeUser.mockRejectedValue(new Error("remove failed"))

    await expect(
      service.create({
        name: "Alice Example",
        email: "alice@example.com",
        username: "alice",
        displayUsername: "Alice",
        password: "correct-horse-battery-staple",
        roleIds: [builtInRoleIds.viewer]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create user"
    } satisfies Partial<HTTPException>)

    expect(logger.error).toHaveBeenCalledWith(
      expect.any(Error),
      `failed to roll back created user for id ${user.id}`
    )
  })

  it("updates a user while preserving the immutable username without rereading after auth mutations", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
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

    userRepository.getByID
      .mockResolvedValueOnce({
        ...persistedUser,
        roleNames: [BuiltInRoleName.Viewer]
      })
      .mockRejectedValueOnce(new Error("should not reread updated user"))
    userRepository.updateByID.mockResolvedValue({
      ...persistedUser,
      name: updatedUser.name,
      email: updatedUser.email,
      displayUsername: updatedUser.displayUsername,
      image: updatedUser.image,
      updatedAt: updatedUser.updatedAt,
      roleNames: [BuiltInRoleName.Viewer]
    })
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Editor
    ])
    auth.api.setRole.mockResolvedValue({ user: { id: user.id } })
    auth.api.setUserPassword.mockResolvedValue({ status: true })

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        password: "new-correct-horse-battery-staple",
        roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
      })
    ).resolves.toEqual({
      ...updatedUser,
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
    })

    expect(userRepository.updateByID).toHaveBeenCalledWith(user.id, {
      name: "Alice Updated",
      email: "alice.updated@example.com",
      displayUsername: "Alice Updated",
      image: "https://example.com/alice.png",
      updatedAt: now
    })
    expect(auth.api.setRole).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        role: [BuiltInRoleName.Viewer, BuiltInRoleName.Editor]
      }
    })
    expect(auth.api.setUserPassword).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        newPassword: "new-correct-horse-battery-staple"
      }
    })
    expect(userRepository.getByID).toHaveBeenCalledOnce()
    expect(roleService.getByNames).not.toHaveBeenCalled()
  })

  it("updates profile fields without resetting the password when omitted", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
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

    userRepository.getByID
      .mockResolvedValueOnce(persistedUser)
      .mockResolvedValueOnce({
        ...persistedUser,
        name: updatedUser.name,
        email: updatedUser.email,
        displayUsername: updatedUser.displayUsername,
        image: updatedUser.image,
        updatedAt: updatedUser.updatedAt
      })
    userRepository.updateByID.mockResolvedValue({
      ...persistedUser,
      name: updatedUser.name,
      email: updatedUser.email,
      displayUsername: updatedUser.displayUsername,
      image: updatedUser.image,
      updatedAt: updatedUser.updatedAt
    })
    roleService.getByNames.mockResolvedValue([])

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
    expect(auth.api.setRole).not.toHaveBeenCalled()
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
  })

  it("returns null when updating a missing user", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })

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
    const service = createUserService({ userRepository, roleService, auth, logger })

    userRepository.getByID.mockResolvedValue(persistedUser)
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

  it("rolls back profile and roles when password update fails after a role change", async () => {
    const service = createUserService({ userRepository, roleService, auth, logger })
    const now = new Date("2026-02-03T04:05:06.000Z")
    const existingUser = {
      ...persistedUser,
      roleNames: [BuiltInRoleName.Viewer]
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    userRepository.getByID.mockResolvedValue(existingUser)
    userRepository.updateByID
      .mockResolvedValueOnce({
        ...existingUser,
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        updatedAt: now
      })
      .mockResolvedValueOnce(existingUser)
    roleService.requireRoleNamesFromIds.mockResolvedValue([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Editor
    ])
    auth.api.setRole.mockResolvedValue({ user: { id: user.id } })
    auth.api.setUserPassword.mockResolvedValue({ status: false } as never)

    await expect(
      service.updateByID(user.id, {
        name: "Alice Updated",
        email: "alice.updated@example.com",
        displayUsername: "Alice Updated",
        image: "https://example.com/alice.png",
        password: "new-correct-horse-battery-staple",
        roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
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
    expect(auth.api.setRole).toHaveBeenNthCalledWith(1, {
      body: {
        userId: user.id,
        role: [BuiltInRoleName.Viewer, BuiltInRoleName.Editor]
      }
    })
    expect(auth.api.setRole).toHaveBeenNthCalledWith(2, {
      body: {
        userId: user.id,
        role: [BuiltInRoleName.Viewer]
      }
    })
  })
})
