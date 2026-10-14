import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useUpdateRoleMutation,
} from "@/features/roles/mutations/roles.ts";
import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
} from "@/features/roles/queries/roles.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";
import { formatCount } from "@/lib/format.ts";

import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";

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
  return formatCount(count, "role");
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

  async function invalidateRoleReads(
    roleIds: Array<string>,
    { deleted = false }: { deleted?: boolean } = {},
  ) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      ...roleIds.map((roleId) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(roleId),
          exact: true,
          // A deleted record's open detail page would refetch it only to get a retried 404,
          // delaying the navigation away. Mark it stale instead.
          refetchType: deleted ? "none" : "active",
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
        toastActionError(error, `Failed to create role: ${formatActionError(error)}`);
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
        toastActionError(error, `Failed to update role: ${formatActionError(error)}`);
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

      await invalidateRoleReads(
        roles.map((role) => role.id),
        { deleted: true },
      );
      toastDeleteSummary(result);

      return result;
    },
  };
}
