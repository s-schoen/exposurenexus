import { ApplicationError } from "../application-error.js";
import { isConflictError, isForeignKeyError } from "../database-error.js";
import { hashPlaintextPassword } from "./password.js";

import type {
  CreateUserCommand,
  IdentityUsers,
  UpdateUserByIDCommand,
  UserCreatedOutcome,
  UserUpdatedOutcome,
} from "./identity.js";
import type { UserProfileRecordWithRoles } from "./types.js";
import type { UserProfileRepository } from "./user-profile-repository.js";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Logger } from "pino";

interface UserDependencies {
  userProfileRepository: UserProfileRepository;
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

export function createUsers({ userProfileRepository, logger }: UserDependencies): IdentityUsers {
  return {
    async listAll(): Promise<UserProfile[]> {
      try {
        return (await userProfileRepository.list()).map(toUserProfile);
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
        const userProfile = await userProfileRepository.getByID(id);
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
        const userProfile = await userProfileRepository.getByUsername(username);
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
        const createdProfile = await userProfileRepository.create(
          {
            ...profile,
            passwordHash: await hashPlaintextPassword(password),
          },
          roleIds,
        );

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
        const existingProfile = await userProfileRepository.getByID(id);
        if (!existingProfile) {
          logger.debug(`cannot update user profile ${id}: not found`);
          return null;
        }

        const { password, roleIds, ...profile } = userProfile;
        const sessionRevocationReasons = [
          ...(password === undefined ? [] : ["password_changed"]),
          ...(existingProfile.enabled && profile.enabled === false ? ["user_disabled"] : []),
          ...(sameStringSet(existingProfile.roleIds, roleIds) ? [] : ["role_assignments_changed"]),
        ];
        const updateResult = await userProfileRepository.updateByID({
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
          revokeSessions: sessionRevocationReasons.length > 0,
        });

        if (!updateResult) {
          logger.debug(`cannot update user profile ${id}: not found`);
          return null;
        }

        const { userProfile: updatedProfile, revokedSessionCount } = updateResult;

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
