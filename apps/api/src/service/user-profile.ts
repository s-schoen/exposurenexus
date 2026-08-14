import { hashPlaintextPassword } from "../lib/argon2.js";
import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type UserEventPayloads,
} from "../lib/eventbus/events/index.js";
import { ApplicationError } from "./application-error.js";
import { isConflictError, isForeignKeyError } from "./errors.js";

import type { UserProfileRepository } from "../repository/user-profile.js";
import type {
  CreateUserProfile,
  UserProfile,
  UserProfileInternalWithRoles,
  UpdateUserProfile,
} from "@exposurenexus/types/model/user";
import type { Logger } from "pino";

interface UserProfileServiceDependencies {
  userProfileRepository: UserProfileRepository;
  domainEventEmitter: DomainEventEmitter;
  logger: Logger;
}

type UserEventSubject = keyof UserEventPayloads & string;

export interface UpdateUserProfileByIDOptions {
  id: string;
  userProfile: UpdateUserProfile;
  eventContext?: DomainEventContext;
}

export interface UserProfileService {
  listAll(): Promise<UserProfile[]>;
  getByID(id: string): Promise<UserProfile | null>;
  getByUsername(username: string): Promise<UserProfile | null>;
  create(userProfile: CreateUserProfile, eventContext?: DomainEventContext): Promise<UserProfile>;
  updateByID(options: UpdateUserProfileByIDOptions): Promise<UserProfile | null>;
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

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((value) => rightSet.has(value));
}

export function createUserProfileService({
  userProfileRepository,
  domainEventEmitter,
  logger,
}: UserProfileServiceDependencies): UserProfileService {
  const emitUserProfileEvent = createDomainEventEmitter<UserEventSubject>(
    domainEventEmitter,
    "user-profile",
  );

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

    async create(
      userProfile: CreateUserProfile,
      eventContext: DomainEventContext = {},
    ): Promise<UserProfile> {
      try {
        const { password, roleIds, ...profile } = userProfile;
        const createdProfile = await userProfileRepository.create(
          {
            ...profile,
            passwordHash: await hashPlaintextPassword(password),
          },
          roleIds,
        );

        const createdUserProfile = toUserProfile(createdProfile);
        emitUserProfileEvent("user.created", { user: createdUserProfile }, eventContext);
        return createdUserProfile;
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
      eventContext = {},
    }: UpdateUserProfileByIDOptions): Promise<UserProfile | null> {
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
            `revoked user sessions after sensitive user profile update`,
          );
        }

        const previousUserProfile = toUserProfile(existingProfile);
        const updatedUserProfile = toUserProfile(updatedProfile);
        emitUserProfileEvent(
          "user.updated",
          {
            previous: previousUserProfile,
            current: updatedUserProfile,
          },
          eventContext,
        );
        return updatedUserProfile;
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
