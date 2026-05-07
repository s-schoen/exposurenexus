import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type {
  CreateUserProfile,
  UserProfile,
  UserProfileInternalWithRoles,
  UpdateUserProfile
} from "@exposurenexus/types/model/user"
import { hashPlaintextPassword } from "../lib/argon2.js"
import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type UserEventPayloads
} from "../lib/eventbus/events/index.js"
import {
  badRequest,
  conflict,
  isConflictError,
  isForeignKeyError
} from "./errors.js"

interface UserProfileRepository {
  list(): Promise<UserProfileInternalWithRoles[]>
  getByID(id: string): Promise<UserProfileInternalWithRoles | null>
  getByUsername(username: string): Promise<UserProfileInternalWithRoles | null>
  create(
    userProfile: Omit<UserProfileInternalWithRoles, "id" | "roleIds">,
    roleIds: readonly string[]
  ): Promise<UserProfileInternalWithRoles>
  update(
    id: string,
    userProfile: Omit<UserProfileInternalWithRoles, "id" | "roleIds">,
    roleIds: readonly string[],
    options?: { revokeSessions?: boolean }
  ): Promise<{
    userProfile: UserProfileInternalWithRoles
    revokedSessionCount: number
  } | null>
}

interface UserProfileServiceDependencies {
  userProfileRepository: UserProfileRepository
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

type UserEventSubject = keyof UserEventPayloads & string

function toUserProfile(userProfile: UserProfileInternalWithRoles): UserProfile {
  return {
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.displayName,
    email: userProfile.email,
    enabled: userProfile.enabled,
    roleIds: userProfile.roleIds
  }
}

function userProfileConflict(): HTTPException {
  return conflict("user profile already exists")
}

function invalidUserRoleAssignment(): HTTPException {
  return badRequest("invalid user role assignment")
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)

  if (leftSet.size !== rightSet.size) {
    return false
  }

  return [...leftSet].every((value) => rightSet.has(value))
}

export function createUserProfileService({
  userProfileRepository,
  domainEventEmitter,
  logger
}: UserProfileServiceDependencies) {
  const emitUserProfileEvent = createDomainEventEmitter<UserEventSubject>(
    domainEventEmitter,
    "user-profile"
  )

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

    async create(
      userProfile: CreateUserProfile,
      eventContext: DomainEventContext = {}
    ): Promise<UserProfile> {
      try {
        const { password, roleIds, ...profile } = userProfile
        const createdProfile = await userProfileRepository.create(
          {
            ...profile,
            passwordHash: await hashPlaintextPassword(password)
          },
          roleIds
        )

        const createdUserProfile = toUserProfile(createdProfile)
        emitUserProfileEvent(
          "user.created",
          { user: createdUserProfile },
          eventContext
        )
        return createdUserProfile
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile create conflict")
          throw userProfileConflict()
        }
        if (isForeignKeyError(error)) {
          logger.debug(error, "user profile create role assignment invalid")
          throw invalidUserRoleAssignment()
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
      userProfile: UpdateUserProfile,
      eventContext: DomainEventContext = {}
    ): Promise<UserProfile | null> {
      try {
        const existingProfile = await userProfileRepository.getByID(id)
        if (!existingProfile) {
          logger.debug(`cannot update user profile ${id}: not found`)
          return null
        }

        const { password, roleIds, ...profile } = userProfile
        const sessionRevocationReasons = [
          ...(password === undefined ? [] : ["password_changed"]),
          ...(existingProfile.enabled && profile.enabled === false
            ? ["user_disabled"]
            : []),
          ...(sameStringSet(existingProfile.roleIds, roleIds)
            ? []
            : ["role_assignments_changed"])
        ]
        const updateResult = await userProfileRepository.update(
          id,
          {
            username: existingProfile.username,
            displayName: profile.displayName ?? existingProfile.displayName,
            email: profile.email ?? existingProfile.email,
            enabled: profile.enabled ?? existingProfile.enabled,
            passwordHash:
              password === undefined
                ? existingProfile.passwordHash
                : await hashPlaintextPassword(password)
          },
          roleIds,
          { revokeSessions: sessionRevocationReasons.length > 0 }
        )

        if (!updateResult) {
          logger.debug(`cannot update user profile ${id}: not found`)
          return null
        }

        const { userProfile: updatedProfile, revokedSessionCount } =
          updateResult

        if (sessionRevocationReasons.length > 0) {
          logger.info(
            {
              userProfileId: id,
              reasons: sessionRevocationReasons,
              revokedSessionCount
            },
            `revoked user sessions after sensitive user profile update`
          )
        }

        const previousUserProfile = toUserProfile(existingProfile)
        const updatedUserProfile = toUserProfile(updatedProfile)
        emitUserProfileEvent(
          "user.updated",
          {
            previous: previousUserProfile,
            current: updatedUserProfile
          },
          eventContext
        )
        return updatedUserProfile
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile update conflict")
          throw userProfileConflict()
        }
        if (isForeignKeyError(error)) {
          logger.debug(error, "user profile update role assignment invalid")
          throw invalidUserRoleAssignment()
        }

        logger.error(error, `failed to update user profile with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to update user profile"
        })
      }
    }
  }
}
