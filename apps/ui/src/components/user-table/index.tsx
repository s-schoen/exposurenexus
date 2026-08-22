import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";

import { createListRolesQueryOptions } from "@/api/role.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { Button } from "@/components/ui/button.tsx";
import { createColumns } from "@/components/user-table/columns.tsx";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const groupingOptions: Array<GroupingOption> = [
  {
    id: "enabled",
    label: "Status",
    formatValue: (value) => (value ? "Enabled" : "Disabled"),
  },
];

interface UserTableProps {
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedUserId?: string;
  onSelectUser?: (user: UserProfile) => void;
  onCreateUser?: () => void;
}

export function UserTable({
  filterState,
  onFilterStateChange,
  selectedUserId,
  onSelectUser,
  onCreateUser,
}: UserTableProps = {}) {
  const navigate = useNavigate();
  const usersQuery = useQuery(createListUsersQueryOptions());
  const rolesQuery = useQuery(createListRolesQueryOptions());
  const roleLabelById = useMemo(
    () => new Map((rolesQuery.data ?? []).map((role) => [role.id, role.name])),
    [rolesQuery.data],
  );
  const columns = useMemo(
    () => createColumns(roleLabelById, rolesQuery.isSuccess),
    [roleLabelById, rolesQuery.isSuccess],
  );

  const handleOpenUser = async (user: UserProfile) => {
    await navigate({
      to: "/users/$id",
      params: {
        id: user.id,
      },
    });
  };

  function ToolbarElements() {
    return (
      <Button variant="default" size="sm" className="h-9 rounded-xl" onClick={onCreateUser}>
        <Plus />
        New user
      </Button>
    );
  }

  return (
    <DataTable
      columns={columns}
      query={usersQuery}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectUser}
      onRowDoubleClick={handleOpenUser}
      isRowActive={(user) => user.id === selectedUserId}
      toolbarControls={onCreateUser ? <ToolbarElements /> : undefined}
    />
  );
}
