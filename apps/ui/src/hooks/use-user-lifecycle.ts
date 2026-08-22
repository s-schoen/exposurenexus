import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
  useCreateUserMutation,
  useUpdateUserMutation,
} from "@/api/user.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";

import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export interface UserLifecycleActions {
  createUser: (value: CreateUserProfile) => Promise<UserProfile | null>;
  updateUser: (userId: string, value: UpdateUserProfile) => Promise<UserProfile | null>;
}

const listQueryKey = createListUsersQueryOptions().queryKey;

function detailQueryKey(userId: string) {
  return createUserByIDQueryOptions(userId).queryKey;
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
  };
}
