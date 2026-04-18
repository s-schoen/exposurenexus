import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type { User } from "@openvlp/types/model/user"
import type { AuthClient } from "../lib/auth.js"

export interface CreateUser {
  name: string
  email: string
  username: string
  displayUsername: string
  password: string
}

export interface UpdateUser {
  name: string
  email: string
  displayUsername: string
  image: string | null
  password?: string
}

type UserProfileUpdate = Pick<
  User,
  "name" | "email" | "displayUsername" | "image"
> & {
  updatedAt: Date
}

interface UserRepository {
  list(): Promise<User[]>
  getByID(id: string): Promise<User | null>
  updateByID(id: string, user: UserProfileUpdate): Promise<User | null>
}

interface UserServiceDependencies {
  userRepository: UserRepository
  auth: {
    api: Pick<AuthClient["api"], "signUpEmail" | "setUserPassword">
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
  user: User,
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

export function createUserService({
  userRepository,
  auth,
  logger
}: UserServiceDependencies) {
  return {
    async listAll(): Promise<User[]> {
      try {
        return await userRepository.list()
      } catch (error) {
        logger.error(error, "failed to list users")
        throw new HTTPException(500, {
          message: "failed to list users"
        })
      }
    },

    async getByID(id: string): Promise<User | null> {
      try {
        const user = await userRepository.getByID(id)
        if (!user) {
          logger.debug(`user with id ${id} not found`)
        }
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
        const created = await auth.api.signUpEmail({
          body: user
        })

        const persisted = await userRepository.getByID(created.user.id)
        if (!persisted) {
          throw new HTTPException(500, {
            message: "failed to load created user"
          })
        }

        logger.info({ userId: created.user.id }, "created user")
        return persisted
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

        if (user.password !== undefined) {
          try {
            await auth.api.setUserPassword({
              body: {
                userId: id,
                newPassword: user.password
              }
            })
          } catch (error) {
            await rollbackUserProfileUpdate(userRepository, existing, logger)
            throw error
          }
        }

        logger.info({ userId: id }, "updated user")
        return updated
      } catch (error) {
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
