import { Plus } from "lucide-react"
import type { UseQueryResult } from "@tanstack/react-query"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/asset-custom-field-table/columns.tsx"
import { Button } from "@/components/ui/button.tsx"

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
  onCreateCustomField?: () => void
  onDeleteCustomFields?: (
    fields: Array<AssetCustomFieldDefinition>
  ) => Promise<void>
  filterState?: DataTableFilterState
  onFilterStateChange?: (state: DataTableFilterState) => void
}

export function AssetCustomFieldTable({
  query,
  selectedCustomFieldId,
  onSelectCustomField,
  onOpenCustomField,
  onCreateCustomField,
  onDeleteCustomFields,
  filterState,
  onFilterStateChange
}: AssetCustomFieldTableProps) {
  function ToolbarElements() {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-9 rounded-xl"
        onClick={onCreateCustomField}
      >
        <Plus />
        New custom field
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
      onRowClick={onSelectCustomField}
      onRowDoubleClick={onOpenCustomField}
      onRowDelete={onDeleteCustomFields}
      isRowActive={(field) => field.id === selectedCustomFieldId}
      toolbarControls={onCreateCustomField ? <ToolbarElements /> : undefined}
    />
  )
}
