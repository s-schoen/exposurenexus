import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useMemo } from "react";

import { DataList } from "@/components/data-list/data-list.tsx";
import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { Button } from "@/components/ui/button.tsx";
import { createListRolesQueryOptions } from "@/features/roles";
import { createColumns } from "@/features/users/components/user-list/columns.tsx";
import { createListUsersQueryOptions } from "@/features/users/queries/users.ts";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const groupingOptions: Array<GroupingOption> = [
  {
    id: "enabled",
    label: "Status",
    formatValue: (value) => (value ? "Enabled" : "Disabled"),
  },
];

interface UserListProps {
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedUserId?: string;
  onSelectUser?: (user: UserProfile) => void;
  onCreateUser?: () => void;
}

export function UserList({
  filterState,
  onFilterStateChange,
  selectedUserId,
  onSelectUser,
  onCreateUser,
}: UserListProps = {}) {
  const navigate = useNavigate();
  const usersQuery = useSuspenseQuery(createListUsersQueryOptions());
  const rolesQuery = useSuspenseQuery(createListRolesQueryOptions());
  const roleLabelById = useMemo(
    () => new Map(rolesQuery.data.map((role) => [role.id, role.name])),
    [rolesQuery.data],
  );
  const columns = useMemo(
    () => createColumns(roleLabelById, rolesQuery.isSuccess),
    [roleLabelById, rolesQuery.isSuccess],
  );

  const handleOpenUser = async (user: UserProfile) => {
    await navigate({
      to: "/settings/users/$id",
      params: {
        id: user.id,
      },
    });
  };

  return (
    <DataList
      label="Users"
      columns={columns}
      query={usersQuery}
      getRowId={(user) => user.id}
      getRowHref={(user) => `/settings/users/${user.id}`}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectUser}
      onRowDoubleClick={handleOpenUser}
      isRowActive={(user) => user.id === selectedUserId}
      emptyState={
        <DataListEmpty icon={Users} message="No users yet.">
          {onCreateUser && (
            <Button variant="outline" onClick={onCreateUser}>
              <Plus />
              New user
            </Button>
          )}
        </DataListEmpty>
      }
    />
  );
}
