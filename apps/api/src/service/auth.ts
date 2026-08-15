import { createHmac, randomBytes } from "node:crypto";

import { verifyPasswordHash } from "../lib/argon2.js";
import {
  createDomainEventEmitter,
  type AuthEventPayloads,
  type DomainEventEmitter,
  type EventSubjects,
} from "../lib/eventbus/events/index.js";
import { ApplicationError } from "./application-error.js";

import type { UserProfileRepository } from "../repository/user-profile.js";
import type { UserRoleRepository } from "../repository/user-role.js";
import type { UserSessionRepository } from "../repository/user-session.js";
import type {
  Permission,
  PermissionResource,
  PermissionVerb,
} from "@exposurenexus/types/model/rbac";
import type {
  UserProfile,
  UserProfileInternalWithRoles,
  UserSession,
} from "@exposurenexus/types/model/user";
import type { Logger } from "pino";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Wa8M0nF1X8xS27SqOFnmsw$98GFJBEC07TapmYXC8zGbR7ARdLfDSr2t1sWeARp0Ag";

type AuthUserProfileRepository = Pick<UserProfileRepository, "getByID" | "getByUsername">;
type AuthUserSessionRepository = Pick<
  UserSessionRepository,
  "getBySessionID" | "create" | "deleteBySessionID"
>;

interface AuthServiceDependencies {
  userProfileRepository: AuthUserProfileRepository;
  userSessionRepository: AuthUserSessionRepository;
  userRoleRepository: UserRoleRepository;
  domainEventEmitter: DomainEventEmitter;
  sessionLifetimeHours: number;
  sessionHmacSecret: string;
  logger: Logger;
}

export interface CreateSessionInput {
  userId: string;
  sourceIp?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface CreateSessionForCredentialsInput {
  username: string;
  password: string;
  sourceIp?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface ValidateSessionInput {
  sessionId: string;
  correlationId?: string;
}

export interface RevokeSessionInput {
  sessionId: string;
  correlationId?: string;
}

export interface CreatedSession {
  sessionId: string;
  session: UserSession;
  user: UserProfile;
}

export interface ValidatedSession {
  session: UserSession;
  user: UserProfile;
}

type ResourcePermissionVerbAssignment = Partial<Record<PermissionResource, PermissionVerb[]>>;
export interface AuthService {
  createSessionForCredentials(
    input: CreateSessionForCredentialsInput,
  ): Promise<CreatedSession | null>;
  createSession(input: CreateSessionInput): Promise<CreatedSession>;
  validateSession(input: ValidateSessionInput): Promise<ValidatedSession | null>;
  revokeSession(input: RevokeSessionInput): Promise<boolean>;
  userHasPermission(
    userId: string,
    permissions: ResourcePermissionVerbAssignment,
  ): Promise<boolean>;
}

function toUserProfile(userProfile: UserProfileInternalWithRoles): UserProfile {
  return {
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.displayName,
    email: userProfile.email,
    enabled: userProfile.enabled,
    roleIds: userProfile.roleIds,
  };
}

function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function createSessionDigest(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

function hasRequiredPermissions(
  assignedPermissions: readonly Permission[],
  requiredPermissions: ResourcePermissionVerbAssignment,
): boolean {
  const assignedVerbsByResource = new Map<PermissionResource, Set<PermissionVerb>>();

  for (const permission of assignedPermissions) {
    const assignedVerbs = assignedVerbsByResource.get(permission.resource) ?? new Set();
    assignedVerbs.add(permission.verb);
    assignedVerbsByResource.set(permission.resource, assignedVerbs);
  }

  for (const [resource, verbs] of Object.entries(requiredPermissions)) {
    const typedResource = resource as PermissionResource;
    const assignedVerbs = assignedVerbsByResource.get(typedResource);

    for (const verb of verbs ?? []) {
      if (!assignedVerbs?.has(verb)) {
        return false;
      }
    }
  }

  return true;
}

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const {
    userProfileRepository,
    userSessionRepository,
    userRoleRepository,
    sessionLifetimeHours,
    sessionHmacSecret,
    domainEventEmitter,
    logger,
  } = dependencies;
  const emitAuthEvent = createDomainEventEmitter<EventSubjects<AuthEventPayloads>>(
    domainEventEmitter,
    "auth",
  );

  async function authenticateUserProfile(
    username: string,
    password: string,
  ): Promise<UserProfileInternalWithRoles | null> {
    const userProfile = await userProfileRepository.getByUsername(username);
    const passwordHash = userProfile?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPasswordHash(password, passwordHash);

    if (!userProfile?.enabled || !passwordMatches) {
      return null;
    }

    return userProfile;
  }

  async function createUserSession(
    input: CreateSessionInput,
    userProfile?: UserProfileInternalWithRoles,
  ): Promise<CreatedSession> {
    const now = new Date();
    const sessionId = createSessionToken();
    const sessionIdDigest = createSessionDigest(sessionId, sessionHmacSecret);
    const session = await userSessionRepository.create({
      sessionId: sessionIdDigest,
      userId: input.userId,
      sourceIp: input.sourceIp || null,
      userAgent: input.userAgent || null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
    const sessionUserProfile = userProfile ?? (await userProfileRepository.getByID(input.userId));

    if (!sessionUserProfile) {
      throw new Error("failed to load session user");
    }
    const publicUserProfile = toUserProfile(sessionUserProfile);

    emitAuthEvent(
      "auth.session.created",
      {
        user: publicUserProfile,
        session: session,
      },
      input,
    );

    return {
      sessionId,
      session,
      user: publicUserProfile,
    };
  }

  return {
    async createSessionForCredentials(
      input: CreateSessionForCredentialsInput,
    ): Promise<CreatedSession | null> {
      try {
        const userProfile = await authenticateUserProfile(input.username, input.password);

        if (!userProfile) {
          emitAuthEvent(
            "auth.failure",
            {
              username: input.username,
              reason: "invalid-credentials",
            },
            input,
          );
          return null;
        }
        const publicUserProfile = toUserProfile(userProfile);

        emitAuthEvent(
          "auth.success",
          {
            user: publicUserProfile,
          },
          input,
        );

        return await createUserSession(
          {
            userId: userProfile.id,
            sourceIp: input.sourceIp,
            userAgent: input.userAgent,
            correlationId: input.correlationId,
          },
          userProfile,
        );
      } catch (error) {
        logger.error(error, "failed to create session for credentials");
        throw new ApplicationError({
          code: "auth.credentials_session_create_failed",
          kind: "unexpected",
          message: "failed to create session for credentials",
          cause: error,
          details: { username: input.username },
        });
      }
    },

    async createSession(input: CreateSessionInput): Promise<CreatedSession> {
      try {
        return await createUserSession(input);
      } catch (error) {
        logger.error(error, "failed to create user session");
        throw new ApplicationError({
          code: "auth.session_create_failed",
          kind: "unexpected",
          message: "failed to create user session",
          cause: error,
          details: { userId: input.userId },
        });
      }
    },

    async validateSession(input: ValidateSessionInput): Promise<ValidatedSession | null> {
      try {
        const sessionIdDigest = createSessionDigest(input.sessionId, sessionHmacSecret);
        const session = await userSessionRepository.getBySessionID(sessionIdDigest);

        if (!session) {
          emitAuthEvent(
            "auth.failure",
            {
              sessionId: input.sessionId,
              reason: "invalid-session",
            },
            input,
          );
          return null;
        }

        if (session.expiresAt.getTime() <= Date.now()) {
          emitAuthEvent(
            "auth.failure",
            {
              sessionId: input.sessionId,
              reason: "session-expired",
            },
            input,
          );
          return null;
        }

        const userProfile = await userProfileRepository.getByID(session.userId);
        if (!userProfile) {
          emitAuthEvent(
            "auth.failure",
            {
              sessionId: input.sessionId,
              reason: "unknown-user",
            },
            input,
          );
          return null;
        }

        if (!userProfile.enabled) {
          emitAuthEvent(
            "auth.failure",
            {
              sessionId: input.sessionId,
              reason: "disabled-user",
            },
            input,
          );
          return null;
        }

        return {
          session,
          user: toUserProfile(userProfile),
        };
      } catch (error) {
        logger.error(error, "failed to validate user session");
        throw new ApplicationError({
          code: "auth.session_validate_failed",
          kind: "unexpected",
          message: "failed to validate user session",
          cause: error,
        });
      }
    },

    async revokeSession(input: RevokeSessionInput): Promise<boolean> {
      try {
        const sessionIdDigest = createSessionDigest(input.sessionId, sessionHmacSecret);
        const revokedSession = await userSessionRepository.deleteBySessionID(sessionIdDigest);

        if (revokedSession) {
          emitAuthEvent(
            "auth.session.revoked",
            {
              session: revokedSession,
            },
            input,
          );
        }

        return Boolean(revokedSession);
      } catch (error) {
        logger.error(error, "failed to revoke user session");
        throw new ApplicationError({
          code: "auth.session_revoke_failed",
          kind: "unexpected",
          message: "failed to revoke user session",
          cause: error,
        });
      }
    },

    async userHasPermission(
      userId: string,
      permissions: ResourcePermissionVerbAssignment,
    ): Promise<boolean> {
      try {
        const assignedPermissions = await userRoleRepository.listPermissionsByUserID(userId);

        return hasRequiredPermissions(assignedPermissions, permissions);
      } catch (error) {
        logger.error(error, "failed to check user permissions");
        throw new ApplicationError({
          code: "auth.permission_check_failed",
          kind: "unexpected",
          message: "failed to check user permissions",
          cause: error,
          details: { userId },
        });
      }
    },
  };
}
