import { ApplicationError } from "../application-error.js";
import { verifyPasswordHash } from "../identity/password.js";
import {
  getUserProfileByID,
  getUserProfileByUsername,
} from "../identity/user-profile-persistence.js";
import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../runtime.js";
import { createSessionDigest, createSessionToken } from "./crypto.js";
import {
  deleteUserSessionByDigest,
  getUserSessionByDigest,
  insertUserSession,
} from "./session-persistence.js";

import type { UserProfileRecordWithRoles } from "../identity/types.js";
import type { UserSessionRecord } from "./types.js";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Logger } from "pino";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Wa8M0nF1X8xS27SqOFnmsw$98GFJBEC07TapmYXC8zGbR7ARdLfDSr2t1sWeARp0Ag";

export interface AuthenticationConfiguration {
  sessionLifetimeHours: number;
  sessionHmacSecret: string;
}

export interface CreateSessionCommand {
  userId: string;
  sourceIp?: string;
  userAgent?: string;
}

export interface CreateSessionForCredentialsCommand {
  username: string;
  password: string;
  sourceIp?: string;
  userAgent?: string;
}

export interface ValidateSessionCommand {
  sessionToken: string;
}

export interface RevokeSessionCommand {
  sessionToken: string;
}

export interface AuthenticationSession {
  id: string;
  userId: string;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionCreatedOutcome {
  sessionToken: string;
  session: AuthenticationSession;
  user: UserProfile;
}

export type AuthenticationFailureReason =
  | "invalid-credentials"
  | "invalid-session"
  | "session-expired"
  | "unknown-user"
  | "disabled-user";

export type CredentialsSessionOutcome =
  | {
      authenticated: false;
      reason: "invalid-credentials";
    }
  | ({ authenticated: true } & SessionCreatedOutcome);

export type SessionValidationOutcome =
  | {
      valid: false;
      reason: Exclude<AuthenticationFailureReason, "invalid-credentials">;
    }
  | {
      valid: true;
      session: AuthenticationSession;
      user: UserProfile;
    };

export type SessionRevocationOutcome =
  | {
      revoked: false;
    }
  | {
      revoked: true;
      session: AuthenticationSession;
    };

export interface Authentication {
  createSessionForCredentials(
    command: CreateSessionForCredentialsCommand,
  ): Promise<CredentialsSessionOutcome>;
  createSession(command: CreateSessionCommand): Promise<SessionCreatedOutcome>;
  validateSession(command: ValidateSessionCommand): Promise<SessionValidationOutcome>;
  revokeSession(command: RevokeSessionCommand): Promise<SessionRevocationOutcome>;
}

interface AuthenticationDependencies extends AuthenticationConfiguration {
  userProfileReader: UserProfileReader;
  sessionPersistence: SessionPersistence;
  logger: Logger;
}

interface UserProfileReader {
  getByID(id: string): Promise<UserProfileRecordWithRoles | null>;
  getByUsername(username: string): Promise<UserProfileRecordWithRoles | null>;
}

interface SessionPersistence {
  getBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null>;
  create(session: Omit<UserSessionRecord, "id">): Promise<UserSessionRecord>;
  deleteBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null>;
}

function toUserProfile(userProfile: UserProfileRecordWithRoles): UserProfile {
  return {
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.displayName,
    email: userProfile.email,
    enabled: userProfile.enabled,
    roleIds: userProfile.roleIds,
  };
}

function toAuthenticationSession(session: UserSessionRecord): AuthenticationSession {
  return {
    id: session.id,
    userId: session.userId,
    sourceIp: session.sourceIp,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

export function createAuthenticationBehavior({
  userProfileReader,
  sessionPersistence,
  sessionLifetimeHours,
  sessionHmacSecret,
  logger,
}: AuthenticationDependencies): Authentication {
  async function authenticateUserProfile(
    username: string,
    password: string,
  ): Promise<UserProfileRecordWithRoles | null> {
    const userProfile = await userProfileReader.getByUsername(username);
    const passwordHash = userProfile?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPasswordHash(password, passwordHash);

    if (!userProfile?.enabled || !passwordMatches) {
      return null;
    }

    return userProfile;
  }

  async function createUserSession(
    command: CreateSessionCommand,
    userProfile?: UserProfileRecordWithRoles,
  ): Promise<SessionCreatedOutcome> {
    const now = new Date();
    const sessionToken = createSessionToken();
    const sessionDigest = createSessionDigest(sessionToken, sessionHmacSecret);
    const sessionRecord = await sessionPersistence.create({
      sessionId: sessionDigest,
      userId: command.userId,
      sourceIp: command.sourceIp || null,
      userAgent: command.userAgent || null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
    const sessionUserProfile = userProfile ?? (await userProfileReader.getByID(command.userId));

    if (!sessionUserProfile) {
      throw new Error("failed to load session user");
    }

    return {
      sessionToken,
      session: toAuthenticationSession(sessionRecord),
      user: toUserProfile(sessionUserProfile),
    };
  }

  return {
    async createSessionForCredentials(
      command: CreateSessionForCredentialsCommand,
    ): Promise<CredentialsSessionOutcome> {
      try {
        const userProfile = await authenticateUserProfile(command.username, command.password);

        if (!userProfile) {
          return {
            authenticated: false,
            reason: "invalid-credentials",
          };
        }

        return {
          authenticated: true,
          ...(await createUserSession(
            {
              userId: userProfile.id,
              sourceIp: command.sourceIp,
              userAgent: command.userAgent,
            },
            userProfile,
          )),
        };
      } catch (error) {
        logger.error(error, "failed to create session for credentials");
        throw new ApplicationError({
          code: "auth.credentials_session_create_failed",
          kind: "unexpected",
          message: "failed to create session for credentials",
          cause: error,
          details: { username: command.username },
        });
      }
    },

    async createSession(command: CreateSessionCommand): Promise<SessionCreatedOutcome> {
      try {
        return await createUserSession(command);
      } catch (error) {
        logger.error(error, "failed to create user session");
        throw new ApplicationError({
          code: "auth.session_create_failed",
          kind: "unexpected",
          message: "failed to create user session",
          cause: error,
          details: { userId: command.userId },
        });
      }
    },

    async validateSession(command: ValidateSessionCommand): Promise<SessionValidationOutcome> {
      try {
        const sessionDigest = createSessionDigest(command.sessionToken, sessionHmacSecret);
        const sessionRecord = await sessionPersistence.getBySessionDigest(sessionDigest);

        if (!sessionRecord) {
          return { valid: false, reason: "invalid-session" };
        }

        if (sessionRecord.expiresAt.getTime() <= Date.now()) {
          return { valid: false, reason: "session-expired" };
        }

        const userProfile = await userProfileReader.getByID(sessionRecord.userId);
        if (!userProfile) {
          return { valid: false, reason: "unknown-user" };
        }

        if (!userProfile.enabled) {
          return { valid: false, reason: "disabled-user" };
        }

        return {
          valid: true,
          session: toAuthenticationSession(sessionRecord),
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

    async revokeSession(command: RevokeSessionCommand): Promise<SessionRevocationOutcome> {
      try {
        const sessionDigest = createSessionDigest(command.sessionToken, sessionHmacSecret);
        const revokedSession = await sessionPersistence.deleteBySessionDigest(sessionDigest);

        if (!revokedSession) {
          return { revoked: false };
        }

        return {
          revoked: true,
          session: toAuthenticationSession(revokedSession),
        };
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
  };
}

const authenticationRuntimeKey = {};

export function createAuthentication(
  runtime: BackendRuntime,
  configuration: AuthenticationConfiguration,
): Authentication {
  return getOrCreateRuntimeValue(runtime, authenticationRuntimeKey, () => {
    const database = getRuntimeDatabase(runtime);
    const logger = getRuntimeLogger(runtime);

    return createAuthenticationBehavior({
      ...configuration,
      userProfileReader: {
        getByID: (id) => getUserProfileByID(database, id),
        getByUsername: (username) => getUserProfileByUsername(database, username),
      },
      sessionPersistence: {
        getBySessionDigest: (sessionDigest) => getUserSessionByDigest(database, sessionDigest),
        create: (session) => insertUserSession(database, session),
        deleteBySessionDigest: (sessionDigest) =>
          deleteUserSessionByDigest(database, sessionDigest),
      },
      logger: logger.child({ capability: "authentication" }),
    });
  });
}
