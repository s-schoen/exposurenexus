import { Plus, Tags } from "lucide-react";

import { DataList } from "@/components/data-list/data-list.tsx";
import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { Button } from "@/components/ui/button.tsx";
import { columns } from "@/features/custom-fields/components/custom-field-list/columns.tsx";
import { CustomFieldTypeIcon } from "@/features/custom-fields/components/custom-field-type-icon.tsx";
import { formatCustomFieldType } from "@/features/custom-fields/lib/custom-field-type.ts";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldType,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { UseQueryResult, UseSuspenseQueryResult } from "@tanstack/react-query";

const groupingOptions: Array<GroupingOption> = [
  {
    id: "type",
    label: "Type",
    formatValue: (value) => formatCustomFieldType(value as AssetCustomFieldType),
    renderIcon: (value) => <CustomFieldTypeIcon type={value as AssetCustomFieldType} decorative />,
  },
  {
    id: "required",
    label: "Required",
  },
];

// Type and required by default; the default value and option count can be turned on under Display.
const initialColumnVisibility = { defaultValue: false, optionCount: false };

interface CustomFieldListProps {
  query:
    | UseQueryResult<Array<AssetCustomFieldDefinition>, Error>
    | UseSuspenseQueryResult<Array<AssetCustomFieldDefinition>, Error>;
  selectedCustomFieldId?: string;
  onSelectCustomField?: (field: AssetCustomFieldDefinition) => void;
  onOpenCustomField?: (field: AssetCustomFieldDefinition) => void;
  onCreateCustomField?: () => void;
  onDeleteCustomFields?: (fields: Array<AssetCustomFieldDefinition>) => Promise<void>;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
}

export function CustomFieldList({
  query,
  selectedCustomFieldId,
  onSelectCustomField,
  onOpenCustomField,
  onCreateCustomField,
  onDeleteCustomFields,
  filterState,
  onFilterStateChange,
}: CustomFieldListProps) {
  return (
    <DataList
      inset
      label="Custom fields"
      columns={columns}
      query={query}
      getRowId={(field) => field.id}
      getRowHref={(field) => `/settings/custom-fields/${field.id}`}
      groupingOptions={groupingOptions}
      initialColumnVisibility={initialColumnVisibility}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      onRowClick={onSelectCustomField}
      onRowDoubleClick={onOpenCustomField}
      onRowDelete={onDeleteCustomFields}
      isRowActive={(field) => field.id === selectedCustomFieldId}
      emptyState={
        <DataListEmpty icon={Tags} message="No custom fields yet.">
          {onCreateCustomField && (
            <Button variant="outline" onClick={onCreateCustomField}>
              <Plus />
              New custom field
            </Button>
          )}
        </DataListEmpty>
      }
    />
  );
}
