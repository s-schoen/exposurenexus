import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { useMemo } from "react"
import type { UserProfile } from "@openvlp/types/model/user"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { createListRolesQueryOptions } from "@/api/role.ts"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { createColumns } from "@/components/user-table/columns.tsx"

const groupingOptions: Array<GroupingOption> = [
  {
    id: "enabled",
    label: "Status",
    formatValue: (value) => (value ? "Enabled" : "Disabled")
  }
]

interface UserTableProps {
  selectedUserId?: string
  onSelectUser?: (user: UserProfile) => void
}

export function UserTable({
  selectedUserId,
  onSelectUser
}: UserTableProps = {}) {
  const navigate = useNavigate()
  const usersQuery = useQuery(createListUsersQueryOptions())
  const rolesQuery = useQuery(createListRolesQueryOptions())
  const [filter, setFilter] = useQueryState("filter")
  const [enabledFilter, setEnabledFilter] = useQueryState(
    "enabled",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters: enabledFilter.length > 0 ? { enabled: enabledFilter } : {}
    }),
    [filter, enabledFilter]
  )
  const roleLabelById = useMemo(
    () => new Map((rolesQuery.data ?? []).map((role) => [role.id, role.name])),
    [rolesQuery.data]
  )
  const columns = useMemo(
    () => createColumns(roleLabelById, rolesQuery.isSuccess),
    [roleLabelById, rolesQuery.isSuccess]
  )

  const handleOpenUser = async (user: UserProfile) => {
    await navigate({
      to: "/users/$id",
      params: {
        id: user.id
      }
    })
  }

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)
    const nextEnabledFilter = nextState.selectFilters.enabled ?? []

    void setEnabledFilter(nextEnabledFilter.length ? nextEnabledFilter : null)
  }

  return (
    <DataTable
      columns={columns}
      query={usersQuery}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={handleFilterStateChange}
      onRowClick={onSelectUser}
      onRowDoubleClick={handleOpenUser}
      isRowActive={(user) => user.id === selectedUserId}
    />
  )
}
