import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useUpdateRoleMutation,
} from "@/api/role.ts";
import { toastActionError } from "@/lib/action-error-toast.ts";

import type { CreateRole, Role, UpdateRole } from "@exposurenexus/types/model/rbac";

export interface RoleLifecycleFailure {
  role: Role;
  error: unknown;
}

export interface RoleLifecycleBatchResult {
  successful: Array<Role>;
  failed: Array<RoleLifecycleFailure>;
}

export interface RoleLifecycleActions {
  createRole: (value: CreateRole) => Promise<Role | null>;
  updateRole: (roleId: string, value: UpdateRole) => Promise<Role | null>;
  deleteRoles: (roles: Array<Role>) => Promise<RoleLifecycleBatchResult>;
}

const listQueryKey = createListRolesQueryOptions().queryKey;

function detailQueryKey(roleId: string) {
  return createRoleByIDQueryOptions(roleId).queryKey;
}

function formatRoleCount(count: number) {
  return `${count} role${count === 1 ? "" : "s"}`;
}

function createBatchResult(
  roles: Array<Role>,
  results: Array<PromiseSettledResult<Role>>,
): RoleLifecycleBatchResult {
  return results.reduce<RoleLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value);
      } else {
        result.failed.push({
          role: roles[index],
          error: settled.reason,
        });
      }

      return result;
    },
    {
      successful: [],
      failed: [],
    },
  );
}

function toastDeleteSummary(result: RoleLifecycleBatchResult) {
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`Deleted ${formatRoleCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to delete ${formatRoleCount(total)}`);
    return;
  }

  toast.error(
    `Deleted ${formatRoleCount(result.successful.length)}; failed ${formatRoleCount(result.failed.length)}`,
  );
}

export function useRoleLifecycle(): RoleLifecycleActions {
  const queryClient = useQueryClient();
  const roleCreate = useCreateRoleMutation();
  const roleUpdate = useUpdateRoleMutation();
  const roleDelete = useDeleteRoleMutation();

  async function invalidateRoleReads(roleIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      ...roleIds.map((roleId) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(roleId),
          exact: true,
        }),
      ),
    ]);
  }

  return {
    async createRole(value) {
      try {
        const createdRole = await roleCreate.mutateAsync(value);

        toast.success(`Created role ${createdRole.name}`);
        await invalidateRoleReads([createdRole.id]);

        return createdRole;
      } catch (error) {
        toastActionError(error, `Failed to create role: ${error}`);
        console.error(error);
        return null;
      }
    },

    async updateRole(roleId, value) {
      try {
        const updatedRole = await roleUpdate.mutateAsync({
          id: roleId,
          role: value,
        });

        toast.success(`Updated role ${updatedRole.name}`);
        await invalidateRoleReads([roleId]);

        return updatedRole;
      } catch (error) {
        toastActionError(error, `Failed to update role: ${error}`);
        console.error(error);
        return null;
      }
    },

    async deleteRoles(roles) {
      if (roles.length === 0) {
        return {
          successful: [],
          failed: [],
        };
      }

      const result = createBatchResult(
        roles,
        await Promise.allSettled(roles.map((role) => roleDelete.mutateAsync(role.id))),
      );

      for (const failure of result.failed) {
        console.error(failure.error);
      }

      await invalidateRoleReads(roles.map((role) => role.id));
      toastDeleteSummary(result);

      return result;
    },
  };
}
