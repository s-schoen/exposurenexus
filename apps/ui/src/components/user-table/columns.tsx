import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx";
import { Badge } from "@/components/ui/badge.tsx";

import type { UserProfile } from "@exposurenexus/types/model/user";
import type { ColumnDef } from "@tanstack/react-table";

function resolveRoleLabels(
  roleIds: ReadonlyArray<string>,
  roleLabelById: ReadonlyMap<string, string>,
) {
  return roleIds.flatMap((roleId) => {
    const roleLabel = roleLabelById.get(roleId);
    return roleLabel ? [roleLabel] : [];
  });
}

export function createColumns(
  roleLabelById: ReadonlyMap<string, string>,
  rolesResolved: boolean,
): Array<ColumnDef<UserProfile>> {
  return [
    {
      id: "displayName",
      accessorFn: (user) => user.displayName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Display name" />,
    },
    {
      id: "username",
      accessorFn: (user) => user.username,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Username" />,
      cell: ({ row }) => {
        const username = row.original.username;

        return username ? (
          <span>{username}</span>
        ) : (
          <span className="text-muted-foreground">No username</span>
        );
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      id: "roles",
      accessorFn: (user) => resolveRoleLabels(user.roleIds, roleLabelById).join(", "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roles" />,
      cell: ({ row }) => {
        const roleIds = row.original.roleIds;

        if (roleIds.length === 0) {
          return <span className="text-muted-foreground">No roles</span>;
        }

        if (!rolesResolved) {
          return (
            <span className="text-muted-foreground">
              {roleIds.length} role{roleIds.length === 1 ? "" : "s"}
            </span>
          );
        }

        const roleLabels = resolveRoleLabels(roleIds, roleLabelById);
        const visibleRoleLabels = roleLabels.slice(0, 2);
        const hiddenRoleCount = Math.max(roleLabels.length - visibleRoleLabels.length, 0);
        const unresolvedRoleCount = Math.max(roleIds.length - roleLabels.length, 0);

        return (
          <div className="flex items-center gap-1">
            {visibleRoleLabels.map((roleLabel) => (
              <Badge key={roleLabel} variant="outline" className="rounded-full">
                {roleLabel}
              </Badge>
            ))}
            {hiddenRoleCount > 0 && (
              <Badge variant="outline" className="rounded-full">
                +{hiddenRoleCount} more
              </Badge>
            )}
            {unresolvedRoleCount > 0 && (
              <Badge variant="outline" className="rounded-full text-muted-foreground">
                +{unresolvedRoleCount} unknown
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const enabled = row.getValue<boolean>("enabled");

        return (
          <Badge
            variant="outline"
            className={
              enabled
                ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                : "rounded-full border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
        );
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;

        return filterValue.includes(String(row.getValue("enabled")));
      },
      meta: {
        label: "Status",
        filterVariant: "select",
        options: [
          { label: "Enabled", value: "true" },
          { label: "Disabled", value: "false" },
        ],
      },
    },
  ];
}
