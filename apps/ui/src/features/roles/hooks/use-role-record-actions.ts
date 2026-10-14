import { useNavigate } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import { isBuiltInRoleId } from "@/features/roles/lib/role.ts";
import { useLeaveDeletedRecords } from "@/hooks/use-leave-deleted-records.ts";
import { useStableCallback } from "@/hooks/use-stable-callback.ts";
import { formatCount } from "@/lib/format.ts";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { Role } from "@exposurenexus/contracts/model/rbac";

/** Confirms and deletes custom roles, then leaves the page or peek of any deleted role. */
export function useDeleteRoles() {
  const roleLifecycle = useRoleLifecycle();
  const leaveDeletedRecords = useLeaveDeletedRecords("/settings/roles");

  return useStableCallback(async (roles: Array<Role>) => {
    const customRoles = roles.filter((role) => !isBuiltInRoleId(role.id));

    if (customRoles.length === 0) {
      toast.error("Built-in roles cannot be deleted");
      return;
    }

    const confirmed = await ConfirmDialog.call({
      title: "Delete roles",
      description: "This action cannot be undone.",
      message: `Are you sure you want to delete ${formatCount(customRoles.length, "custom role")}?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await roleLifecycle.deleteRoles(customRoles);
    await leaveDeletedRecords(result.successful.map((role) => role.id));
  });
}

/** The role's ⋯ menu on its detail page and peek. Built-in roles show it with every item disabled. */
export function useRoleRecordActions(role: Role) {
  const navigate = useNavigate();
  const deleteRoles = useDeleteRoles();

  return useMemo<Array<PageAction>>(() => {
    const builtIn = isBuiltInRoleId(role.id);

    return [
      {
        label: "Edit role",
        icon: Pencil,
        disabled: builtIn,
        onClick: () => {
          void navigate({ to: "/settings/roles/$id/edit", params: { id: role.id } });
        },
      },
      {
        label: "Delete role…",
        icon: Trash2,
        variant: "destructive",
        disabled: builtIn,
        onClick: () => void deleteRoles([role]),
      },
    ];
  }, [deleteRoles, navigate, role]);
}
