import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCreateUserMutation, useUpdateUserMutation } from "@/features/users/mutations/users.ts";
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
} from "@/features/users/queries/users.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";

import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export interface UserLifecycleFailure {
  user: UserProfile;
  error: unknown;
}

export interface UserLifecycleBatchResult {
  successful: Array<UserProfile>;
  failed: Array<UserLifecycleFailure>;
}

export interface UserLifecycleActions {
  createUser: (value: CreateUserProfile) => Promise<UserProfile | null>;
  updateUser: (userId: string, value: UpdateUserProfile) => Promise<UserProfile | null>;
  /** Enables or disables many users, with one summary toast. */
  setUsersEnabled: (
    users: Array<UserProfile>,
    enabled: boolean,
  ) => Promise<UserLifecycleBatchResult>;
}

const listQueryKey = createListUsersQueryOptions().queryKey;

function detailQueryKey(userId: string) {
  return createUserByIDQueryOptions(userId).queryKey;
}

function formatUserCount(count: number) {
  return `${count} user${count === 1 ? "" : "s"}`;
}

function createBatchResult(
  users: Array<UserProfile>,
  results: Array<PromiseSettledResult<UserProfile>>,
): UserLifecycleBatchResult {
  return results.reduce<UserLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value);
      } else {
        result.failed.push({ user: users[index], error: settled.reason });
      }

      return result;
    },
    { successful: [], failed: [] },
  );
}

function toastEnabledSummary(result: UserLifecycleBatchResult, enabled: boolean) {
  const [done, verb] = enabled ? ["Enabled", "enable"] : ["Disabled", "disable"];
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`${done} ${formatUserCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to ${verb} ${formatUserCount(total)}`);
    return;
  }

  toast.error(
    `${done} ${formatUserCount(result.successful.length)}; failed ${formatUserCount(result.failed.length)}`,
  );
}

export function useUserLifecycle(): UserLifecycleActions {
  const queryClient = useQueryClient();
  const userCreate = useCreateUserMutation();
  const userUpdate = useUpdateUserMutation();

  async function invalidateUserReads(userIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      ...userIds.map((userId) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(userId),
          exact: true,
        }),
      ),
    ]);
  }

  return {
    async createUser(value) {
      try {
        const createdUser = await userCreate.mutateAsync(value);

        toast.success(`Created user ${createdUser.displayName}`);
        await invalidateUserReads([createdUser.id]);

        return createdUser;
      } catch (error) {
        toastActionError(error, `Failed to create user: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async updateUser(userId, value) {
      try {
        const updatedUser = await userUpdate.mutateAsync({
          id: userId,
          user: value,
        });

        queryClient.setQueryData(detailQueryKey(userId), updatedUser);
        toast.success(`Updated user ${updatedUser.displayName}`);
        await invalidateUserReads([userId]);

        return updatedUser;
      } catch (error) {
        toastActionError(error, `Failed to update user: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async setUsersEnabled(users, enabled) {
      if (users.length === 0) {
        return { successful: [], failed: [] };
      }

      const result = createBatchResult(
        users,
        await Promise.allSettled(
          users.map((user) =>
            userUpdate.mutateAsync({
              id: user.id,
              user: {
                displayName: user.displayName,
                email: user.email,
                roleIds: user.roleIds,
                enabled,
              },
            }),
          ),
        ),
      );

      for (const failure of result.failed) {
        console.error(failure.error);
      }

      for (const user of result.successful) {
        queryClient.setQueryData(detailQueryKey(user.id), user);
      }

      await invalidateUserReads(users.map((user) => user.id));
      toastEnabledSummary(result, enabled);

      return result;
    },
  };
}
