import { KeyRound, Plus } from "lucide-react";

import { DataList } from "@/components/data-list/data-list.tsx";
import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { Button } from "@/components/ui/button.tsx";
import { columns } from "@/features/roles/components/role-list/columns.tsx";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UseQueryResult, UseSuspenseQueryResult } from "@tanstack/react-query";

const groupingOptions: Array<GroupingOption> = [
  {
    id: "kind",
    label: "Type",
  },
];

// Type and permission count by default; resources can be turned on under Display.
const initialColumnVisibility = { resources: false };

interface RoleListProps {
  query: UseQueryResult<Array<Role>, Error> | UseSuspenseQueryResult<Array<Role>, Error>;
  selectedRoleId?: string;
  onSelectRole?: (role: Role) => void;
  onOpenRole?: (role: Role) => void;
  onCreateRole?: () => void;
  onDeleteRoles?: (roles: Array<Role>) => Promise<void>;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
}

export function RoleList({
  query,
  selectedRoleId,
  onSelectRole,
  onOpenRole,
  onCreateRole,
  onDeleteRoles,
  filterState,
  onFilterStateChange,
}: RoleListProps) {
  return (
    <DataList
      label="Roles"
      columns={columns}
      query={query}
      getRowId={(role) => role.id}
      getRowHref={(role) => `/settings/roles/${role.id}`}
      groupingOptions={groupingOptions}
      initialColumnVisibility={initialColumnVisibility}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectRole}
      onRowDoubleClick={onOpenRole}
      onRowDelete={onDeleteRoles}
      isRowActive={(role) => role.id === selectedRoleId}
      emptyState={
        <DataListEmpty icon={KeyRound} message="No roles yet.">
          {onCreateRole && (
            <Button variant="outline" onClick={onCreateRole}>
              <Plus />
              New role
            </Button>
          )}
        </DataListEmpty>
      }
    />
  );
}
