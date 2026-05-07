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
  UserProfileInternalWithRoles,
  UserSession
} from "@openvlp/types/model/user"
import { verifyPasswordHash } from "../lib/argon2.js"
import {
  createEventPayload,
  type DomainEventEmitter
} from "../lib/eventbus/events/index.js"

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Wa8M0nF1X8xS27SqOFnmsw$98GFJBEC07TapmYXC8zGbR7ARdLfDSr2t1sWeARp0Ag"

interface UserProfileRepository {
  getByID(id: string): Promise<UserProfileInternalWithRoles | null>
  getByUsername(username: string): Promise<UserProfileInternalWithRoles | null>
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
  domainEventEmitter: DomainEventEmitter
  sessionLifetimeHours: number
  sessionHmacSecret: string
  logger: Logger
}

export interface CreateSessionInput {
  userId: string
  sourceIp?: string
  userAgent?: string
}

export interface CreateSessionForCredentialsInput {
  username: string
  password: string
  sourceIp?: string
  userAgent?: string
}

export interface CreatedSession {
  sessionId: string
  session: UserSession
  user: UserProfile
}

export interface ValidatedSession {
  session: UserSession
  user: UserProfile
}

type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, PermissionVerb[]>
>

export interface AuthService {
  createSessionForCredentials(
    input: CreateSessionForCredentialsInput
  ): Promise<CreatedSession | null>
  createSession(input: CreateSessionInput): Promise<CreatedSession>
  validateSession(sessionId: string): Promise<ValidatedSession | null>
  revokeSession(sessionId: string): Promise<boolean>
  userHasPermission(
    userId: string,
    permissions: ResourcePermissionVerbAssignment
  ): Promise<boolean>
}

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

export function createAuthService(
  dependencies: AuthServiceDependencies
): AuthService {
  const {
    userProfileRepository,
    userSessionRepository,
    userRoleRepository,
    sessionLifetimeHours,
    sessionHmacSecret,
    domainEventEmitter,
    logger
  } = dependencies
  async function authenticateUserProfile(
    username: string,
    password: string
  ): Promise<UserProfileInternalWithRoles | null> {
    const userProfile = await userProfileRepository.getByUsername(username)
    const passwordHash = userProfile?.passwordHash ?? DUMMY_PASSWORD_HASH
    const passwordMatches = await verifyPasswordHash(password, passwordHash)

    if (!userProfile?.enabled || !passwordMatches) {
      return null
    }

    return userProfile
  }

  async function createUserSession(
    input: CreateSessionInput,
    userProfile?: UserProfileInternalWithRoles
  ): Promise<CreatedSession> {
    const now = new Date()
    const sessionId = createSessionToken()
    const sessionIdDigest = createSessionDigest(sessionId, sessionHmacSecret)
    const session = await userSessionRepository.create({
      sessionId: sessionIdDigest,
      userId: input.userId,
      sourceIp: input.sourceIp || null,
      userAgent: input.userAgent || null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000)
    })
    const sessionUserProfile =
      userProfile ?? (await userProfileRepository.getByID(input.userId))

    if (!sessionUserProfile) {
      throw new Error("failed to load session user")
    }

    domainEventEmitter.emit(
      createEventPayload({
        subject: "auth.session.created",
        source: "auth",
        data: {
          user: sessionUserProfile,
          session: session
        }
      })
    )

    return {
      sessionId,
      session,
      user: toUserProfile(sessionUserProfile)
    }
  }

  return {
    async createSessionForCredentials(
      input: CreateSessionForCredentialsInput
    ): Promise<CreatedSession | null> {
      try {
        const userProfile = await authenticateUserProfile(
          input.username,
          input.password
        )

        if (!userProfile) {
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.failure",
              source: "auth",
              data: {
                username: input.username,
                reason: "invalid-credentials"
              }
            })
          )
          return null
        }

        domainEventEmitter.emit(
          createEventPayload({
            subject: "auth.success",
            source: "auth",
            data: {
              user: userProfile
            }
          })
        )

        return await createUserSession(
          {
            userId: userProfile.id,
            sourceIp: input.sourceIp,
            userAgent: input.userAgent
          },
          userProfile
        )
      } catch (error) {
        logger.error(error, "failed to create session for credentials")
        throw new HTTPException(500, {
          message: "failed to create session for credentials"
        })
      }
    },

    async createSession(input: CreateSessionInput): Promise<CreatedSession> {
      try {
        return await createUserSession(input)
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
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.failure",
              source: "auth",
              data: {
                sessionId: sessionId,
                reason: "invalid-session"
              }
            })
          )
          return null
        }

        if (session.expiresAt.getTime() <= Date.now()) {
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.failure",
              source: "auth",
              data: {
                sessionId: sessionId,
                reason: "session-expired"
              }
            })
          )
          return null
        }

        const userProfile = await userProfileRepository.getByID(session.userId)
        if (!userProfile) {
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.failure",
              source: "auth",
              data: {
                sessionId: sessionId,
                reason: "unknown-user"
              }
            })
          )
          return null
        }

        if (!userProfile.enabled) {
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.failure",
              source: "auth",
              data: {
                sessionId: sessionId,
                reason: "disabled-user"
              }
            })
          )
          return null
        }

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
          domainEventEmitter.emit(
            createEventPayload({
              subject: "auth.session.revoked",
              source: "auth",
              data: {
                session: revokedSession
              }
            })
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
