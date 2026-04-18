import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { useMemo } from "react"
import type { User } from "@openvlp/types/model/user"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { columns } from "@/components/user-table/columns.tsx"

const groupingOptions: Array<GroupingOption> = [
  {
    id: "emailVerified",
    label: "Status",
    formatValue: (value) => (value ? "Verified" : "Unverified")
  }
]

interface UserTableProps {
  selectedUserId?: string
  onSelectUser?: (user: User) => void
}

export function UserTable({
  selectedUserId,
  onSelectUser
}: UserTableProps = {}) {
  const navigate = useNavigate()
  const usersQuery = useQuery(createListUsersQueryOptions())
  const [filter, setFilter] = useQueryState("filter")
  const [emailVerifiedFilter, setEmailVerifiedFilter] = useQueryState(
    "emailVerified",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters:
        emailVerifiedFilter.length > 0
          ? { emailVerified: emailVerifiedFilter }
          : {}
    }),
    [filter, emailVerifiedFilter]
  )

  const handleOpenUser = async (user: User) => {
    await navigate({
      to: "/users/$id",
      params: {
        id: user.id
      }
    })
  }

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)
    const nextEmailVerifiedFilter = nextState.selectFilters.emailVerified ?? []

    void setEmailVerifiedFilter(
      nextEmailVerifiedFilter.length ? nextEmailVerifiedFilter : null
    )
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
