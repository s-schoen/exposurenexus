import { useMutation } from "@tanstack/react-query";

import { createRole, deleteRole, updateRole } from "@/features/roles/api/roles.ts";

import type { CreateRole, UpdateRole } from "@exposurenexus/contracts/model/rbac";

export function useCreateRoleMutation() {
  return useMutation({
    mutationFn: (role: CreateRole) => createRole(role),
  });
}

export function useUpdateRoleMutation() {
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UpdateRole }) => updateRole(id, role),
  });
}

export function useDeleteRoleMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
  });
}
