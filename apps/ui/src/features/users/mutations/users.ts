import { useMutation } from "@tanstack/react-query";

import { createUser, updateUser } from "@/features/users/api/users.ts";

import type { CreateUserProfile, UpdateUserProfile } from "@exposurenexus/contracts/model/user";

export function useCreateUserMutation() {
  return useMutation({
    mutationFn: (user: CreateUserProfile) => createUser(user),
  });
}

export function useUpdateUserMutation() {
  return useMutation({
    mutationFn: ({ id, user }: { id: string; user: UpdateUserProfile }) => updateUser(id, user),
  });
}
