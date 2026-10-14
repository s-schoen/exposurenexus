import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { List, SquareDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import {
  CustomFieldRequiredIcon,
  CustomFieldRequiredLabel,
  formatCustomFieldRequired,
} from "@/features/custom-fields/components/custom-field-required-label.tsx";
import { CustomFieldTypeIcon } from "@/features/custom-fields/components/custom-field-type-icon.tsx";
import { formatCustomFieldType } from "@/features/custom-fields/lib/custom-field-type.ts";
import { formatCount } from "@/lib/format.ts";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

function formatDefaultValue(field: AssetCustomFieldDefinition): string | null {
  if (field.defaultValue === null) {
    return null;
  }

  if (field.type === AssetCustomFieldType.Select) {
    const matchingOption = field.options.find((option) => option.value === field.defaultValue);

    return matchingOption?.label ?? field.defaultValue;
  }

  return String(field.defaultValue);
}

export const columns: Array<DataTableColumnDef<AssetCustomFieldDefinition>> = [
  {
    id: "typeIcon",
    accessorFn: (field) => field.type,
    cell: ({ row }) => <CustomFieldTypeIcon type={row.original.type} />,
    enableColumnFilter: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    enableHiding: false,
    enableSorting: false,
    meta: { placement: "leading" },
  },
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <>
        {row.original.name}{" "}
        <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
          {row.original.key}
        </span>
      </>
    ),
    enableColumnFilter: false,
    enableGrouping: false,
    enableHiding: false,
    meta: { label: "Name", placement: "title" },
  },
  {
    // Shown in the title; this column searches and orders by it.
    accessorKey: "key",
    enableColumnFilter: false,
    enableGrouping: false,
    meta: { label: "Key" },
  },
  {
    // The leading icon shows the type; this column filters and groups by it.
    accessorKey: "type",
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true;
      }

      return filterValue.includes(row.original.type);
    },
    meta: {
      label: "Type",
      filterVariant: "select",
      options: Object.values(AssetCustomFieldType).map((type) => ({
        label: formatCustomFieldType(type),
        value: type,
        icon: <CustomFieldTypeIcon type={type} decorative />,
      })),
    },
  },
  {
    id: "required",
    accessorFn: (field) => formatCustomFieldRequired(field.required),
    cell: ({ row }) => (
      <Badge variant="property" title="Required">
        <CustomFieldRequiredLabel required={row.original.required} />
      </Badge>
    ),
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true;
      }

      return filterValue.includes(formatCustomFieldRequired(row.original.required));
    },
    meta: {
      label: "Required",
      placement: "property",
      filterVariant: "select",
      options: [true, false].map((required) => ({
        label: formatCustomFieldRequired(required),
        value: formatCustomFieldRequired(required),
        icon: <CustomFieldRequiredIcon required={required} />,
      })),
    },
  },
  {
    id: "defaultValue",
    accessorFn: (field) => formatDefaultValue(field) ?? "",
    cell: ({ row }) => {
      const defaultValue = formatDefaultValue(row.original);

      return (
        <Badge variant="property" title="Default">
          <SquareDashed strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Default</span>
          {defaultValue === null ? (
            <span className="text-muted-foreground">No default</span>
          ) : (
            <span className="max-w-40 truncate">{defaultValue}</span>
          )}
        </Badge>
      );
    },
    enableColumnFilter: false,
    enableGrouping: false,
    meta: { label: "Default", placement: "property" },
  },
  {
    id: "optionCount",
    accessorFn: (field) =>
      field.type === AssetCustomFieldType.Select ? field.options.length : null,
    cell: ({ row }) => {
      if (row.original.type !== AssetCustomFieldType.Select) {
        return null;
      }

      const count = row.original.options.length;

      return (
        <Badge variant="property" title="Options">
          <List strokeWidth={1.5} aria-hidden="true" />
          <span className="tabular-nums">{formatCount(count, "option")}</span>
        </Badge>
      );
    },
    enableColumnFilter: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    meta: { label: "Options", placement: "property" },
  },
];
