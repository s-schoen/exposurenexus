import { Plus } from "lucide-react";

import { columns } from "@/components/asset-custom-field-table/columns.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { UseQueryResult } from "@tanstack/react-query";

const groupingOptions: Array<GroupingOption> = [
  {
    id: "type",
    label: "Type",
  },
  {
    id: "required",
    label: "Required",
  },
];

interface AssetCustomFieldTableProps {
  query: UseQueryResult<Array<AssetCustomFieldDefinition>, Error>;
  selectedCustomFieldId?: string;
  onSelectCustomField?: (field: AssetCustomFieldDefinition) => void;
  onOpenCustomField?: (field: AssetCustomFieldDefinition) => void;
  onCreateCustomField?: () => void;
  onDeleteCustomFields?: (fields: Array<AssetCustomFieldDefinition>) => Promise<void>;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
}

export function AssetCustomFieldTable({
  query,
  selectedCustomFieldId,
  onSelectCustomField,
  onOpenCustomField,
  onCreateCustomField,
  onDeleteCustomFields,
  filterState,
  onFilterStateChange,
}: AssetCustomFieldTableProps) {
  function ToolbarElements() {
    return (
      <Button variant="default" size="sm" className="h-9 rounded-xl" onClick={onCreateCustomField}>
        <Plus />
        New custom field
      </Button>
    );
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
  );
}
