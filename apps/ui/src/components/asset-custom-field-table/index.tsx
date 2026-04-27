import type { UseQueryResult } from "@tanstack/react-query"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/asset-custom-field-table/columns.tsx"

const groupingOptions: Array<GroupingOption> = [
  {
    id: "type",
    label: "Type"
  },
  {
    id: "required",
    label: "Required"
  }
]

interface AssetCustomFieldTableProps {
  query: UseQueryResult<Array<AssetCustomFieldDefinition>, Error>
  selectedCustomFieldId?: string
  onSelectCustomField?: (field: AssetCustomFieldDefinition) => void
  onOpenCustomField?: (field: AssetCustomFieldDefinition) => void
  filterState?: DataTableFilterState
  onFilterStateChange?: (state: DataTableFilterState) => void
}

export function AssetCustomFieldTable({
  query,
  selectedCustomFieldId,
  onSelectCustomField,
  onOpenCustomField,
  filterState,
  onFilterStateChange
}: AssetCustomFieldTableProps) {
  return (
    <DataTable
      columns={columns}
      query={query}
      groupingOptions={groupingOptions}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectCustomField}
      onRowDoubleClick={onOpenCustomField}
      isRowActive={(field) => field.id === selectedCustomFieldId}
    />
  )
}
