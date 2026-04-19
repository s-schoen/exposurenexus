import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { Role } from "@openvlp/types/model/rbac"
import type { CreateUser, UpdateUser, User } from "@openvlp/types/model/user"
import type { AuthClient } from "../lib/auth.js"
import type { PersistedUser } from "../repository/user.js"

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function buildRoleIdsByName(roles: readonly Pick<Role, "id" | "name">[]) {
  return new Map(roles.map((role) => [role.name, role.id]))
}

async function mapPersistedUsersToUsers(
  users: readonly PersistedUser[],
  roleService: RoleService,
  logger: Logger
): Promise<User[]> {
  const roleNames = uniqueValues(users.flatMap((user) => user.roleNames))
  const roles =
    roleNames.length === 0 ? [] : await roleService.getByNames(roleNames)
  const roleIdByName = buildRoleIdsByName(roles)
  const missingRoleNames = roleNames.filter(
    (roleName) => !roleIdByName.has(roleName)
  )

  if (missingRoleNames.length > 0) {
    logger.debug(
      { missingRoleNames },
      "ignoring unresolved persisted role names"
    )
  }

  return users.map(({ roleNames: persistedRoleNames, ...user }) => ({
    ...user,
    roleIds: uniqueValues(
      persistedRoleNames.flatMap((roleName) => {
        const roleId = roleIdByName.get(roleName)
        return roleId ? [roleId] : []
      })
    )
  }))
}

async function resolvePersistedUserRoleIds(
  user: PersistedUser,
  roleService: RoleService,
  logger: Logger
): Promise<string[]> {
  const [mappedUser] = await mapPersistedUsersToUsers(
    [user],
    roleService,
    logger
  )
  return mappedUser?.roleIds ?? []
}

function buildUserFromPersistedUser(
  user: PersistedUser,
  roleIds: readonly string[]
): User {
  const {
    id,
    name,
    email,
    emailVerified,
    image,
    createdAt,
    updatedAt,
    username,
    displayUsername
  } = user
  return {
    id,
    name,
    email,
    emailVerified,
    image,
    createdAt,
    updatedAt,
    username,
    displayUsername,
    roleIds: uniqueValues(roleIds)
  }
}

type UserProfileUpdate = Pick<
  PersistedUser,
  "name" | "email" | "displayUsername" | "image"
> & {
  updatedAt: Date
}

interface UserRepository {
  list(): Promise<PersistedUser[]>
  getByID(id: string): Promise<PersistedUser | null>
  updateByID(id: string, user: UserProfileUpdate): Promise<PersistedUser | null>
}

interface RoleService {
  getByNames(names: readonly string[]): Promise<Role[]>
  requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]>
}

interface UserServiceDependencies {
  userRepository: UserRepository
  roleService: RoleService
  auth: {
    api: Pick<
      AuthClient["api"],
      "signUpEmail" | "setRole" | "setUserPassword" | "removeUser"
    >
  }
  logger: Logger
}

function isConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const errorWithStatus = error as Error & {
    status?: number
    statusCode?: number
    code?: string
  }
  const message = error.message.toLowerCase()

  return (
    errorWithStatus.status === 409 ||
    errorWithStatus.statusCode === 409 ||
    errorWithStatus.code === "23505" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  )
}

function userConflict(): HTTPException {
  return new HTTPException(409, {
    message: "user already exists"
  })
}

async function rollbackUserProfileUpdate(
  userRepository: UserRepository,
  user: PersistedUser,
  logger: Logger
): Promise<void> {
  try {
    await userRepository.updateByID(user.id, {
      name: user.name,
      email: user.email,
      displayUsername: user.displayUsername,
      image: user.image,
      updatedAt: user.updatedAt
    })
  } catch (rollbackError) {
    logger.error(
      rollbackError,
      `failed to roll back user profile update for id ${user.id}`
    )
  }
}

async function rollbackUserRoleUpdate(
  auth: UserServiceDependencies["auth"],
  user: PersistedUser,
  logger: Logger
): Promise<void> {
  try {
    const roleResult = await auth.api.setRole({
      body: {
        userId: user.id,
        role: user.roleNames
      }
    })
    if (roleResult.user === undefined) {
      throw new Error("failed to set user role")
    }
  } catch (rollbackError) {
    logger.error(
      rollbackError,
      `failed to roll back user role update for id ${user.id}`
    )
  }
}

async function rollbackCreatedUser(
  auth: UserServiceDependencies["auth"],
  userId: string,
  logger: Logger
): Promise<void> {
  try {
    const removeUserResult = await auth.api.removeUser({
      body: {
        userId
      }
    })
    if (!removeUserResult.success) {
      throw new Error("failed to remove user")
    }
  } catch (rollbackError) {
    logger.error(
      rollbackError,
      `failed to roll back created user for id ${userId}`
    )
  }
}

export function createUserService({
  userRepository,
  roleService,
  auth,
  logger
}: UserServiceDependencies) {
  return {
    async listAll(): Promise<User[]> {
      try {
        return await mapPersistedUsersToUsers(
          await userRepository.list(),
          roleService,
          logger
        )
      } catch (error) {
        logger.error(error, "failed to list users")
        throw new HTTPException(500, {
          message: "failed to list users"
        })
      }
    },

    async getByID(id: string): Promise<User | null> {
      try {
        const persistedUser = await userRepository.getByID(id)
        if (!persistedUser) {
          logger.debug(`user with id ${id} not found`)
          return null
        }

        const [user] = await mapPersistedUsersToUsers(
          [persistedUser],
          roleService,
          logger
        )
        return user
      } catch (error) {
        logger.error(error, `failed to get user with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get user"
        })
      }
    },

    async create(user: CreateUser): Promise<User> {
      try {
        const { roleIds, ...createUser } = user
        const roleNames =
          roleIds === undefined
            ? undefined
            : await roleService.requireRoleNamesFromIds(roleIds)

        const created = await auth.api.signUpEmail({
          body: createUser
        })

        try {
          if (roleNames !== undefined) {
            const roleResult = await auth.api.setRole({
              body: {
                userId: created.user.id,
                role: roleNames
              }
            })
            if (roleResult.user === undefined) {
              throw new Error("failed to set user role")
            }
          }

          const persisted = await userRepository.getByID(created.user.id)
          if (!persisted) {
            throw new HTTPException(500, {
              message: "failed to load created user"
            })
          }

          const [createdUser] = await mapPersistedUsersToUsers(
            [persisted],
            roleService,
            logger
          )

          logger.info({ userId: created.user.id }, "created user")
          return createdUser!
        } catch (error) {
          await rollbackCreatedUser(auth, created.user.id, logger)
          throw error
        }
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }
        if (isConflictError(error)) {
          logger.debug(error, "user create conflict")
          throw userConflict()
        }

        logger.error(error, `failed to create user ${user.email}`)
        throw new HTTPException(500, {
          message: "failed to create user"
        })
      }
    },

    async updateByID(id: string, user: UpdateUser): Promise<User | null> {
      try {
        const existing = await userRepository.getByID(id)
        if (!existing) {
          logger.debug(`cannot update user ${id}: not found`)
          return null
        }

        const roleNames =
          user.roleIds === undefined
            ? undefined
            : await roleService.requireRoleNamesFromIds(user.roleIds)
        const finalRoleIds =
          user.roleIds === undefined
            ? await resolvePersistedUserRoleIds(existing, roleService, logger)
            : uniqueValues(user.roleIds)

        const updated = await userRepository.updateByID(id, {
          name: user.name,
          email: user.email,
          displayUsername: user.displayUsername,
          image: user.image,
          updatedAt: new Date()
        })

        if (!updated) {
          logger.debug(`cannot update user ${id}: not found`)
          return null
        }

        try {
          if (roleNames !== undefined) {
            const roleResult = await auth.api.setRole({
              body: {
                userId: id,
                role: roleNames
              }
            })
            if (roleResult.user === undefined) {
              throw new Error("failed to set user role")
            }
          }

          if (user.password !== undefined) {
            const passwordResult = await auth.api.setUserPassword({
              body: {
                userId: id,
                newPassword: user.password
              }
            })
            if (!passwordResult.status) {
              throw new Error("failed to set user password")
            }
          }
        } catch (error) {
          await rollbackUserProfileUpdate(userRepository, existing, logger)
          if (roleNames !== undefined) {
            await rollbackUserRoleUpdate(auth, existing, logger)
          }
          throw error
        }

        logger.info({ userId: id }, "updated user")
        return buildUserFromPersistedUser(updated, finalRoleIds)
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        if (isConflictError(error)) {
          logger.debug(error, "user update conflict")
          throw userConflict()
        }

        logger.error(error, `failed to update user with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to update user"
        })
      }
    }
  }
}
