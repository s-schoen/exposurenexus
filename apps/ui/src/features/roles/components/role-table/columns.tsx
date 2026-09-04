import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  formatPermissionLabel,
  getRoleKindLabel,
  getUniqueRoleResources,
} from "@/features/roles/lib/role.ts";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { Role } from "@exposurenexus/contracts/model/rbac";

export const columns: Array<DataTableColumnDef<Role>> = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    cell: ({ row }) => (
      <div className="min-w-0 py-0.5">
        <div className="truncate font-medium text-foreground">{row.original.name}</div>
      </div>
    ),
  },
  {
    id: "kind",
    accessorFn: (role) => getRoleKindLabel(role.id),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => {
      const kind = getRoleKindLabel(row.original.id);

      return (
        <Badge
          variant="outline"
          className={
            kind === "Built-in"
              ? "rounded-full border-sky-200 bg-sky-50 text-sky-700"
              : "rounded-full border-violet-200 bg-violet-50 text-violet-700"
          }
        >
          {kind}
        </Badge>
      );
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true;
      }

      return filterValue.includes(getRoleKindLabel(row.original.id));
    },
    meta: {
      label: "Type",
      filterVariant: "select",
      options: [
        { label: "Built-in", value: "Built-in" },
        { label: "Custom", value: "Custom" },
      ],
    },
  },
  {
    id: "permissionCount",
    accessorFn: (role) => role.permissions.length,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Permissions" />,
    cell: ({ row }) => (
      <Badge variant="outline" className="rounded-full">
        {row.original.permissions.length} grant
        {row.original.permissions.length === 1 ? "" : "s"}
      </Badge>
    ),
  },
  {
    id: "resources",
    accessorFn: (role) => getUniqueRoleResources(role.permissions).join(", "),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resources" />,
    cell: ({ row }) => {
      const resources = getUniqueRoleResources(row.original.permissions);
      const visibleResources = resources.slice(0, 3);
      const hiddenResourceCount = Math.max(resources.length - visibleResources.length, 0);

      return (
        <div className="flex items-center gap-1">
          {visibleResources.map((resource) => (
            <Badge key={resource} variant="secondary" className="rounded-full">
              {formatPermissionLabel(resource)}
            </Badge>
          ))}
          {hiddenResourceCount > 0 && (
            <Badge variant="outline" className="rounded-full">
              +{hiddenResourceCount} more
            </Badge>
          )}
        </div>
      );
    },
    enableColumnFilter: false,
  },
];
