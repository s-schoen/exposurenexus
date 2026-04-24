import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type {
  CreateUserProfile,
  UserProfile,
  UserProfileInternal,
  UpdateUserProfile
} from "@openvlp/types/model/user"
import { hashPlaintextPassword } from "../lib/argon2.js"

interface UserProfileRepository {
  list(): Promise<UserProfileInternal[]>
  getByID(id: string): Promise<UserProfileInternal | null>
  getByUsername(username: string): Promise<UserProfileInternal | null>
  create(
    userProfile: Omit<UserProfileInternal, "id">
  ): Promise<UserProfileInternal>
  update(
    id: string,
    userProfile: Omit<UserProfileInternal, "id">
  ): Promise<UserProfileInternal | null>
}

interface UserProfileServiceDependencies {
  userProfileRepository: UserProfileRepository
  logger: Logger
}

function toUserProfile(userProfile: UserProfileInternal): UserProfile {
  return {
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.displayName,
    email: userProfile.email,
    enabled: userProfile.enabled
  }
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

function userProfileConflict(): HTTPException {
  return new HTTPException(409, {
    message: "user profile already exists"
  })
}

export function createUserProfileService({
  userProfileRepository,
  logger
}: UserProfileServiceDependencies) {
  return {
    async listAll(): Promise<UserProfile[]> {
      try {
        return (await userProfileRepository.list()).map(toUserProfile)
      } catch (error) {
        logger.error(error, "failed to list user profiles")
        throw new HTTPException(500, {
          message: "failed to list user profiles"
        })
      }
    },

    async getByID(id: string): Promise<UserProfile | null> {
      try {
        const userProfile = await userProfileRepository.getByID(id)
        if (!userProfile) {
          logger.debug(`user profile with id ${id} not found`)
          return null
        }

        return toUserProfile(userProfile)
      } catch (error) {
        logger.error(error, `failed to get user profile with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get user profile"
        })
      }
    },

    async getByUsername(username: string): Promise<UserProfile | null> {
      try {
        const userProfile = await userProfileRepository.getByUsername(username)
        if (!userProfile) {
          logger.debug(`user profile with username ${username} not found`)
          return null
        }

        return toUserProfile(userProfile)
      } catch (error) {
        logger.error(
          error,
          `failed to get user profile with username ${username}`
        )
        throw new HTTPException(500, {
          message: "failed to get user profile"
        })
      }
    },

    async create(userProfile: CreateUserProfile): Promise<UserProfile> {
      try {
        const { password, ...profile } = userProfile
        const createdProfile = await userProfileRepository.create({
          ...profile,
          passwordHash: await hashPlaintextPassword(password)
        })

        logger.info(
          { userProfileId: createdProfile.id },
          "created user profile"
        )
        return toUserProfile(createdProfile)
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile create conflict")
          throw userProfileConflict()
        }

        logger.error(
          error,
          `failed to create user profile ${userProfile.email}`
        )
        throw new HTTPException(500, {
          message: "failed to create user profile"
        })
      }
    },

    async updateByID(
      id: string,
      userProfile: UpdateUserProfile
    ): Promise<UserProfile | null> {
      try {
        const existingProfile = await userProfileRepository.getByID(id)
        if (!existingProfile) {
          logger.debug(`cannot update user profile ${id}: not found`)
          return null
        }

        const { password, ...profile } = userProfile
        const updatedProfile = await userProfileRepository.update(id, {
          username: existingProfile.username,
          displayName: profile.displayName ?? existingProfile.displayName,
          email: profile.email ?? existingProfile.email,
          enabled: profile.enabled ?? existingProfile.enabled,
          passwordHash:
            password === undefined
              ? existingProfile.passwordHash
              : await hashPlaintextPassword(password)
        })

        if (!updatedProfile) {
          logger.debug(`cannot update user profile ${id}: not found`)
          return null
        }

        logger.info({ userProfileId: id }, "updated user profile")
        return toUserProfile(updatedProfile)
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile update conflict")
          throw userProfileConflict()
        }

        logger.error(error, `failed to update user profile with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to update user profile"
        })
      }
    }
  }
}
