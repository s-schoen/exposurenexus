import type { UseQueryResult } from "@tanstack/react-query"
import type { Role } from "@openvlp/types/model/rbac"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/role-table/columns.tsx"

const groupingOptions: Array<GroupingOption> = [
  {
    id: "kind",
    label: "Type"
  }
]

interface RoleTableProps {
  query: UseQueryResult<Array<Role>, Error>
  selectedRoleId?: string
  onSelectRole?: (role: Role) => void
  onOpenRole?: (role: Role) => void
  filterState?: DataTableFilterState
  onFilterStateChange?: (state: DataTableFilterState) => void
}

export function RoleTable({
  query,
  selectedRoleId,
  onSelectRole,
  onOpenRole,
  filterState,
  onFilterStateChange
}: RoleTableProps) {
  return (
    <DataTable
      columns={columns}
      query={query}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectRole}
      onRowDoubleClick={onOpenRole}
      isRowActive={(role) => role.id === selectedRoleId}
    />
  )
}
