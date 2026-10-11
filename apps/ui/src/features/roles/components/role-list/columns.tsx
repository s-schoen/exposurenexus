import { Boxes, KeyRound, Lock, ShieldCheck, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import {
  formatPermissionLabel,
  getRoleKindLabel,
  getUniqueRoleResources,
  isBuiltInRoleId,
} from "@/features/roles/lib/role.ts";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { Role } from "@exposurenexus/contracts/model/rbac";

const VISIBLE_RESOURCE_COUNT = 3;

function RoleKindIcon({ roleId }: { roleId: string }) {
  const Icon = isBuiltInRoleId(roleId) ? Lock : UserCog;

  return <Icon strokeWidth={1.5} aria-hidden="true" />;
}

export const columns: Array<DataTableColumnDef<Role>> = [
  {
    id: "icon",
    accessorFn: (role) => role.name,
    cell: () => (
      <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
    ),
    enableColumnFilter: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    enableHiding: false,
    enableSorting: false,
    meta: { placement: "leading" },
  },
  {
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    enableColumnFilter: false,
    enableGrouping: false,
    enableHiding: false,
    meta: { label: "Role", placement: "title" },
  },
  {
    id: "kind",
    accessorFn: (role) => getRoleKindLabel(role.id),
    cell: ({ row }) => (
      <Badge variant="property" title="Type">
        <RoleKindIcon roleId={row.original.id} />
        {getRoleKindLabel(row.original.id)}
      </Badge>
    ),
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true;
      }

      return filterValue.includes(getRoleKindLabel(row.original.id));
    },
    meta: {
      label: "Type",
      placement: "property",
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
    cell: ({ row }) => {
      const count = row.original.permissions.length;

      return (
        <Badge variant="property" title="Permissions">
          <ShieldCheck strokeWidth={1.5} aria-hidden="true" />
          <span className="tabular-nums">
            {count} permission{count === 1 ? "" : "s"}
          </span>
        </Badge>
      );
    },
    enableColumnFilter: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    meta: { label: "Permissions", placement: "property" },
  },
  {
    id: "resources",
    accessorFn: (role) => getUniqueRoleResources(role.permissions).join(", "),
    cell: ({ row }) => {
      const resources = getUniqueRoleResources(row.original.permissions);

      if (resources.length === 0) {
        return null;
      }

      const hiddenResourceCount = Math.max(resources.length - VISIBLE_RESOURCE_COUNT, 0);

      return (
        <Badge variant="property" title={resources.map(formatPermissionLabel).join("\n")}>
          <Boxes strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Resources</span>
          <span className="max-w-48 truncate">
            {resources.slice(0, VISIBLE_RESOURCE_COUNT).map(formatPermissionLabel).join(", ")}
          </span>
          {hiddenResourceCount > 0 && (
            <span className="text-muted-foreground tabular-nums">+{hiddenResourceCount}</span>
          )}
        </Badge>
      );
    },
    enableColumnFilter: false,
    enableGrouping: false,
    meta: { label: "Resources", placement: "property" },
  },
];
