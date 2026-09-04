import { ApplicationError } from "../application-error.js";
import { isConflictError, isForeignKeyError } from "../database-error.js";
import { hashPlaintextPassword } from "./password.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type {
  CreateUserCommand,
  IdentityUsers,
  UpdateUserByIDCommand,
  UserCreatedOutcome,
  UserUpdatedOutcome,
} from "./identity.js";
import type { UserProfileRecordWithRoles } from "./types.js";
import type { UserProfileRecord } from "./types.js";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface UserProfilePersistence {
  listUserProfiles(database: DatabaseExecutor): Promise<UserProfileRecordWithRoles[]>;
  getUserProfileByID(
    database: DatabaseExecutor,
    id: string,
  ): Promise<UserProfileRecordWithRoles | null>;
  getUserProfileByUsername(
    database: DatabaseExecutor,
    username: string,
  ): Promise<UserProfileRecordWithRoles | null>;
  insertUserProfile(
    database: DatabaseExecutor,
    options: {
      userProfile: Omit<UserProfileRecord, "id">;
      roleIds: readonly string[];
    },
  ): Promise<UserProfileRecordWithRoles>;
  updateUserProfile(
    database: DatabaseExecutor,
    options: {
      id: string;
      userProfile: Omit<UserProfileRecord, "id">;
      roleIds: readonly string[];
    },
  ): Promise<UserProfileRecordWithRoles | null>;
}

interface SessionPersistence {
  deleteSessionsByUserID(database: DatabaseExecutor, userId: string): Promise<number>;
}

interface UserDependencies {
  database: Kysely<Database>;
  userProfilePersistence: UserProfilePersistence;
  sessionPersistence: SessionPersistence;
  logger: Logger;
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

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((value) => rightSet.has(value));
}

export function createUsers({
  database,
  userProfilePersistence,
  sessionPersistence,
  logger,
}: UserDependencies): IdentityUsers {
  return {
    async listAll(): Promise<UserProfile[]> {
      try {
        return (await userProfilePersistence.listUserProfiles(database)).map(toUserProfile);
      } catch (error) {
        logger.error(error, "failed to list user profiles");
        throw new ApplicationError({
          code: "user_profile.list_failed",
          kind: "unexpected",
          message: "failed to list user profiles",
          cause: error,
        });
      }
    },

    async getByID(id: string): Promise<UserProfile | null> {
      try {
        const userProfile = await userProfilePersistence.getUserProfileByID(database, id);
        if (!userProfile) {
          logger.debug(`user profile with id ${id} not found`);
          return null;
        }

        return toUserProfile(userProfile);
      } catch (error) {
        logger.error(error, `failed to get user profile with id ${id}`);
        throw new ApplicationError({
          code: "user_profile.get_failed",
          kind: "unexpected",
          message: "failed to get user profile",
          cause: error,
          details: { userProfileId: id },
        });
      }
    },

    async getByUsername(username: string): Promise<UserProfile | null> {
      try {
        const userProfile = await userProfilePersistence.getUserProfileByUsername(
          database,
          username,
        );
        if (!userProfile) {
          logger.debug(`user profile with username ${username} not found`);
          return null;
        }

        return toUserProfile(userProfile);
      } catch (error) {
        logger.error(error, `failed to get user profile with username ${username}`);
        throw new ApplicationError({
          code: "user_profile.get_by_username_failed",
          kind: "unexpected",
          message: "failed to get user profile",
          cause: error,
          details: { username },
        });
      }
    },

    async create({ userProfile, performedBy }: CreateUserCommand): Promise<UserCreatedOutcome> {
      try {
        const { password, roleIds, ...profile } = userProfile;
        const createdProfile = await database.transaction().execute(async (trx) => {
          return await userProfilePersistence.insertUserProfile(trx, {
            userProfile: {
              ...profile,
              passwordHash: await hashPlaintextPassword(password),
            },
            roleIds,
          });
        });

        return {
          current: toUserProfile(createdProfile),
          performedBy,
        };
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile create conflict");
          throw new ApplicationError({
            code: "user_profile.create_conflict",
            kind: "conflict",
            message: "user profile already exists",
            cause: error,
            details: {
              username: userProfile.username,
              email: userProfile.email,
            },
          });
        }
        if (isForeignKeyError(error)) {
          logger.debug(error, "user profile create role assignment invalid");
          throw new ApplicationError({
            code: "user_profile.role_assignment_invalid",
            kind: "validation",
            message: "invalid user role assignment",
            cause: error,
            details: { roleIds: userProfile.roleIds },
          });
        }

        logger.error(error, `failed to create user profile ${userProfile.email}`);
        throw new ApplicationError({
          code: "user_profile.create_failed",
          kind: "unexpected",
          message: "failed to create user profile",
          cause: error,
          details: {
            username: userProfile.username,
            email: userProfile.email,
          },
        });
      }
    },

    async updateByID({
      id,
      userProfile,
      performedBy,
    }: UpdateUserByIDCommand): Promise<UserUpdatedOutcome | null> {
      try {
        const { password, roleIds, ...profile } = userProfile;
        const updateResult = await database.transaction().execute(async (trx) => {
          const existingProfile = await userProfilePersistence.getUserProfileByID(trx, id);
          if (!existingProfile) {
            return null;
          }

          const sessionRevocationReasons = [
            ...(password === undefined ? [] : ["password_changed"]),
            ...(existingProfile.enabled && profile.enabled === false ? ["user_disabled"] : []),
            ...(sameStringSet(existingProfile.roleIds, roleIds)
              ? []
              : ["role_assignments_changed"]),
          ];
          const updatedProfile = await userProfilePersistence.updateUserProfile(trx, {
            id,
            userProfile: {
              username: existingProfile.username,
              displayName: profile.displayName,
              email: profile.email,
              enabled: profile.enabled,
              passwordHash:
                password === undefined
                  ? existingProfile.passwordHash
                  : await hashPlaintextPassword(password),
            },
            roleIds,
          });

          if (!updatedProfile) {
            return null;
          }

          const revokedSessionCount =
            sessionRevocationReasons.length > 0
              ? await sessionPersistence.deleteSessionsByUserID(trx, id)
              : 0;

          return {
            existingProfile,
            updatedProfile,
            sessionRevocationReasons,
            revokedSessionCount,
          };
        });

        if (!updateResult) {
          logger.debug(`cannot update user profile ${id}: not found`);
          return null;
        }

        const { existingProfile, updatedProfile, sessionRevocationReasons, revokedSessionCount } =
          updateResult;

        if (sessionRevocationReasons.length > 0) {
          logger.info(
            {
              userProfileId: id,
              reasons: sessionRevocationReasons,
              revokedSessionCount,
            },
            "revoked user sessions after sensitive user profile update",
          );
        }

        return {
          previous: toUserProfile(existingProfile),
          current: toUserProfile(updatedProfile),
          performedBy,
        };
      } catch (error) {
        if (isConflictError(error)) {
          logger.debug(error, "user profile update conflict");
          throw new ApplicationError({
            code: "user_profile.update_conflict",
            kind: "conflict",
            message: "user profile already exists",
            cause: error,
            details: { userProfileId: id },
          });
        }
        if (isForeignKeyError(error)) {
          logger.debug(error, "user profile update role assignment invalid");
          throw new ApplicationError({
            code: "user_profile.role_assignment_invalid",
            kind: "validation",
            message: "invalid user role assignment",
            cause: error,
            details: {
              userProfileId: id,
              roleIds: userProfile.roleIds,
            },
          });
        }

        logger.error(error, `failed to update user profile with id ${id}`);
        throw new ApplicationError({
          code: "user_profile.update_failed",
          kind: "unexpected",
          message: "failed to update user profile",
          cause: error,
          details: { userProfileId: id },
        });
      }
    },
  };
}
