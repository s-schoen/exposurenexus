import { KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { UserAvatar } from "@/features/users/components/user-avatar.tsx";
import { UserStatusIcon, UserStatusLabel } from "@/features/users/components/user-status.tsx";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const VISIBLE_ROLE_COUNT = 2;

function resolveRoleLabels(
  roleIds: ReadonlyArray<string>,
  roleLabelById: ReadonlyMap<string, string>,
) {
  return roleIds.flatMap((roleId) => {
    const roleLabel = roleLabelById.get(roleId);
    return roleLabel ? [roleLabel] : [];
  });
}

function RolesChip({
  roleIds,
  roleLabelById,
  rolesResolved,
}: {
  roleIds: ReadonlyArray<string>;
  roleLabelById: ReadonlyMap<string, string>;
  rolesResolved: boolean;
}) {
  if (roleIds.length === 0 || !rolesResolved) {
    return (
      <Badge variant="property" title="Roles">
        <KeyRound strokeWidth={1.5} aria-hidden="true" />
        <span className="text-muted-foreground">
          {roleIds.length === 0
            ? "No roles"
            : `${roleIds.length} role${roleIds.length === 1 ? "" : "s"}`}
        </span>
      </Badge>
    );
  }

  const roleLabels = resolveRoleLabels(roleIds, roleLabelById);
  const hiddenRoleCount = Math.max(roleLabels.length - VISIBLE_ROLE_COUNT, 0);
  const unresolvedRoleCount = roleIds.length - roleLabels.length;

  return (
    <Badge variant="property" title={roleLabels.join("\n")}>
      <KeyRound strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">Roles</span>
      <span className="max-w-48 truncate">
        {roleLabels.slice(0, VISIBLE_ROLE_COUNT).join(", ")}
      </span>
      {hiddenRoleCount > 0 && (
        <span className="text-muted-foreground tabular-nums">+{hiddenRoleCount} more</span>
      )}
      {unresolvedRoleCount > 0 && (
        <span className="text-muted-foreground tabular-nums">+{unresolvedRoleCount} unknown</span>
      )}
    </Badge>
  );
}

function StatusChip({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant="property" title="Status">
      <UserStatusLabel enabled={enabled} />
    </Badge>
  );
}

export function createColumns(
  roleLabelById: ReadonlyMap<string, string>,
  rolesResolved: boolean,
): Array<DataTableColumnDef<UserProfile>> {
  return [
    {
      id: "avatar",
      accessorFn: (user) => user.displayName,
      cell: ({ row }) => <UserAvatar userId={row.original.id} user={row.original} />,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableGrouping: false,
      enableHiding: false,
      enableSorting: false,
      meta: { placement: "leading" },
    },
    {
      id: "displayName",
      accessorFn: (user) => user.displayName,
      cell: ({ row }) => (
        <>
          {row.original.displayName}{" "}
          <span className="ml-1 font-normal text-muted-foreground">{row.original.email}</span>
        </>
      ),
      enableColumnFilter: false,
      enableHiding: false,
      meta: { label: "Display name", placement: "title" },
    },
    {
      // Shown in the title; this column searches and orders by it.
      accessorKey: "email",
      enableColumnFilter: false,
      enableGrouping: false,
      meta: { label: "Email" },
    },
    {
      // Searches and orders only.
      id: "username",
      accessorFn: (user) => user.username,
      enableColumnFilter: false,
      enableGrouping: false,
      meta: { label: "Username" },
    },
    {
      id: "roles",
      accessorFn: (user) => resolveRoleLabels(user.roleIds, roleLabelById).join(", "),
      cell: ({ row }) => (
        <RolesChip
          roleIds={row.original.roleIds}
          roleLabelById={roleLabelById}
          rolesResolved={rolesResolved}
        />
      ),
      enableColumnFilter: false,
      enableGrouping: false,
      meta: { label: "Roles", placement: "property" },
    },
    {
      accessorKey: "enabled",
      cell: ({ row }) => <StatusChip enabled={row.original.enabled} />,
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;

        return filterValue.includes(String(row.getValue("enabled")));
      },
      meta: {
        label: "Status",
        placement: "property",
        filterVariant: "select",
        options: [
          { label: "Enabled", value: "true", icon: <UserStatusIcon enabled /> },
          { label: "Disabled", value: "false", icon: <UserStatusIcon enabled={false} /> },
        ],
      },
    },
  ];
}
