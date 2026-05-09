import { Plus } from "lucide-react"
import type { UseQueryResult } from "@tanstack/react-query"
import type { Role } from "@exposurenexus/types/model/rbac"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/role-table/columns.tsx"
import { Button } from "@/components/ui/button.tsx"

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
  onCreateRole?: () => void
  onDeleteRoles?: (roles: Array<Role>) => Promise<void>
  filterState?: DataTableFilterState
  onFilterStateChange?: (state: DataTableFilterState) => void
}

export function RoleTable({
  query,
  selectedRoleId,
  onSelectRole,
  onOpenRole,
  onCreateRole,
  onDeleteRoles,
  filterState,
  onFilterStateChange
}: RoleTableProps) {
  function ToolbarElements() {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-9 rounded-xl"
        onClick={onCreateRole}
      >
        <Plus />
        New role
      </Button>
    )
  }

  return (
    <DataTable
      columns={columns}
      query={query}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectRole}
      onRowDoubleClick={onOpenRole}
      onRowDelete={onDeleteRoles}
      isRowActive={(role) => role.id === selectedRoleId}
      toolbarControls={onCreateRole ? <ToolbarElements /> : undefined}
    />
  )
}
