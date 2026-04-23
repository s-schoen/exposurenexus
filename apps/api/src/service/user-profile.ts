import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type {
  UserProfile,
  UserProfileInternal
} from "@openvlp/types/model/user"

interface UserProfileRepository {
  list(): Promise<UserProfileInternal[]>
  getByID(id: string): Promise<UserProfileInternal | null>
  getByUsername(username: string): Promise<UserProfileInternal | null>
}

interface UserProfileServiceDependencies {
  userProfileRepository: UserProfileRepository
  logger: Logger
}

function toUserProfile({
  passwordHash: _passwordHash,
  ...userProfile
}: UserProfileInternal): UserProfile {
  return userProfile
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
    }
  }
}
