import { createHmac, randomBytes } from "node:crypto"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"
import type {
  Permission,
  PermissionResource,
  PermissionVerb
} from "@openvlp/types/model/rbac"
import type {
  UserProfile,
  UserProfileInternal,
  UserSession
} from "@openvlp/types/model/user"
import { verifyPasswordHash } from "../lib/argon2.js"

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Wa8M0nF1X8xS27SqOFnmsw$98GFJBEC07TapmYXC8zGbR7ARdLfDSr2t1sWeARp0Ag"

interface UserProfileRepository {
  getByID(id: string): Promise<UserProfileInternal | null>
  getByUsername(username: string): Promise<UserProfileInternal | null>
}

interface UserSessionRepository {
  getBySessionID(sessionId: string): Promise<UserSession | null>
  create(session: Omit<UserSession, "id">): Promise<UserSession>
  deleteBySessionID(sessionId: string): Promise<UserSession | null>
}

interface UserRoleRepository {
  listPermissionsByUserID(userId: string): Promise<Permission[]>
}

interface AuthServiceDependencies {
  userProfileRepository: UserProfileRepository
  userSessionRepository: UserSessionRepository
  userRoleRepository: UserRoleRepository
  sessionLifetimeHours: number
  sessionHmacSecret: string
  logger: Logger
}

interface CreateSessionInput {
  userId: string
  sourceIp?: string
  userAgent?: string
}

interface CreatedSession {
  sessionId: string
  session: UserSession
}

interface ValidatedSession {
  session: UserSession
  user: UserProfile
}

type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, PermissionVerb[]>
>

function toUserProfile(userProfile: UserProfileInternal): UserProfile {
  return {
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.displayName,
    email: userProfile.email,
    enabled: userProfile.enabled
  }
}

function createSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

function createSessionDigest(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url")
}

function hasRequiredPermissions(
  assignedPermissions: readonly Permission[],
  requiredPermissions: ResourcePermissionVerbAssignment
): boolean {
  const assignedVerbsByResource = new Map<
    PermissionResource,
    Set<PermissionVerb>
  >()

  for (const permission of assignedPermissions) {
    const assignedVerbs =
      assignedVerbsByResource.get(permission.resource) ?? new Set()
    assignedVerbs.add(permission.verb)
    assignedVerbsByResource.set(permission.resource, assignedVerbs)
  }

  for (const [resource, verbs] of Object.entries(requiredPermissions)) {
    const typedResource = resource as PermissionResource
    const assignedVerbs = assignedVerbsByResource.get(typedResource)

    for (const verb of verbs ?? []) {
      if (!assignedVerbs?.has(verb)) {
        return false
      }
    }
  }

  return true
}

export function createAuthService({
  userProfileRepository,
  userSessionRepository,
  userRoleRepository,
  sessionLifetimeHours,
  sessionHmacSecret,
  logger
}: AuthServiceDependencies) {
  return {
    async checkCredentials(
      username: string,
      password: string
    ): Promise<boolean> {
      try {
        const userProfile = await userProfileRepository.getByUsername(username)
        const passwordHash = userProfile?.passwordHash ?? DUMMY_PASSWORD_HASH
        const passwordMatches = await verifyPasswordHash(password, passwordHash)
        const authenticated = Boolean(userProfile?.enabled && passwordMatches)

        if (authenticated) {
          logger.info(`user authentication success for ${username}`)
        } else {
          logger.warn(
            `user authentication failed for ${username}: ${
              userProfile && !userProfile.enabled
                ? "user_disabled"
                : "invalid_credentials"
            }`
          )
        }

        return authenticated
      } catch (error) {
        logger.error(error, "failed to check user credentials")
        throw new HTTPException(500, {
          message: "failed to check user credentials"
        })
      }
    },

    async createSession(input: CreateSessionInput): Promise<CreatedSession> {
      try {
        const now = new Date()
        const sessionId = createSessionToken()
        const sessionIdDigest = createSessionDigest(
          sessionId,
          sessionHmacSecret
        )
        const session = await userSessionRepository.create({
          sessionId: sessionIdDigest,
          userId: input.userId,
          sourceIp: input.sourceIp || null,
          userAgent: input.userAgent || null,
          createdAt: now,
          expiresAt: new Date(
            now.getTime() + sessionLifetimeHours * 60 * 60 * 1000
          )
        })

        logger.info(
          {
            userProfileId: input.userId,
            userSessionId: session.id
          },
          "created user session"
        )

        return {
          sessionId,
          session
        }
      } catch (error) {
        logger.error(error, "failed to create user session")
        throw new HTTPException(500, {
          message: "failed to create user session"
        })
      }
    },

    async validateSession(sessionId: string): Promise<ValidatedSession | null> {
      try {
        const sessionIdDigest = createSessionDigest(
          sessionId,
          sessionHmacSecret
        )
        const session =
          await userSessionRepository.getBySessionID(sessionIdDigest)

        if (!session) {
          logger.warn("user session validation failed: session not found")
          return null
        }

        if (session.expiresAt.getTime() <= Date.now()) {
          logger.warn(
            {
              userProfileId: session.userId,
              userSessionId: session.id
            },
            "user session validation failed: expired"
          )
          return null
        }

        const userProfile = await userProfileRepository.getByID(session.userId)
        if (!userProfile) {
          logger.warn(
            {
              userProfileId: session.userId,
              userSessionId: session.id
            },
            "user session validation failed: unknown user"
          )
          return null
        }

        if (!userProfile.enabled) {
          logger.warn(
            {
              userProfileId: session.userId,
              userSessionId: session.id
            },
            "user session validation failed: user disabled"
          )
          return null
        }

        logger.debug(
          {
            userProfileId: session.userId,
            userSessionId: session.id
          },
          "user session validation succeeded"
        )

        return {
          session,
          user: toUserProfile(userProfile)
        }
      } catch (error) {
        logger.error(error, "failed to validate user session")
        throw new HTTPException(500, {
          message: "failed to validate user session"
        })
      }
    },

    async revokeSession(sessionId: string): Promise<boolean> {
      try {
        const sessionIdDigest = createSessionDigest(
          sessionId,
          sessionHmacSecret
        )
        const revokedSession =
          await userSessionRepository.deleteBySessionID(sessionIdDigest)

        if (revokedSession) {
          logger.info(
            {
              userProfileId: revokedSession?.userId,
              userSessionId: revokedSession?.id
            },
            "revoked user session"
          )
        }

        return Boolean(revokedSession)
      } catch (error) {
        logger.error(error, "failed to revoke user session")
        throw new HTTPException(500, {
          message: "failed to revoke user session"
        })
      }
    },

    async userHasPermission(
      userId: string,
      permissions: ResourcePermissionVerbAssignment
    ): Promise<boolean> {
      try {
        const assignedPermissions =
          await userRoleRepository.listPermissionsByUserID(userId)

        return hasRequiredPermissions(assignedPermissions, permissions)
      } catch (error) {
        logger.error(error, "failed to check user permissions")
        throw new HTTPException(500, {
          message: "failed to check user permissions"
        })
      }
    }
  }
}
