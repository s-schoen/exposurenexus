import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import type { ColumnDef } from "@tanstack/react-table"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"

function formatTypeLabel(type: AssetCustomFieldType): string {
  switch (type) {
    case AssetCustomFieldType.Text:
      return "Text"
    case AssetCustomFieldType.Number:
      return "Number"
    case AssetCustomFieldType.Select:
      return "Select"
  }
}

function getRequiredLabel(required: boolean): string {
  return required ? "Required" : "Optional"
}

function formatDefaultValue(field: AssetCustomFieldDefinition): string | null {
  if (field.defaultValue === null) {
    return null
  }

  if (field.type === AssetCustomFieldType.Select) {
    const matchingOption = field.options.find(
      (option) => option.value === field.defaultValue
    )

    return matchingOption?.label ?? field.defaultValue
  }

  return String(field.defaultValue)
}

export const columns: Array<ColumnDef<AssetCustomFieldDefinition>> = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="min-w-0 py-0.5">
        <div className="truncate font-medium text-foreground">
          {row.original.name}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {row.original.key}
        </div>
      </div>
    )
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full">
        {formatTypeLabel(row.original.type)}
      </Badge>
    ),
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true
      }

      return filterValue.includes(row.original.type)
    },
    meta: {
      label: "Type",
      filterVariant: "select",
      options: [
        { label: "Text", value: AssetCustomFieldType.Text },
        { label: "Number", value: AssetCustomFieldType.Number },
        { label: "Select", value: AssetCustomFieldType.Select }
      ]
    }
  },
  {
    id: "required",
    accessorFn: (field) => getRequiredLabel(field.required),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Required" />
    ),
    cell: ({ row }) => {
      const required = row.original.required

      return (
        <Badge
          variant="outline"
          className={
            required
              ? "rounded-full border-amber-200 bg-amber-50 text-amber-700"
              : "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
          }
        >
          {getRequiredLabel(required)}
        </Badge>
      )
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true
      }

      return filterValue.includes(getRequiredLabel(row.original.required))
    },
    meta: {
      label: "Required",
      filterVariant: "select",
      options: [
        { label: "Required", value: "Required" },
        { label: "Optional", value: "Optional" }
      ]
    }
  },
  {
    id: "defaultValue",
    accessorFn: (field) => field.defaultValue,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Default" />
    ),
    cell: ({ row }) => {
      const defaultValue = formatDefaultValue(row.original)

      if (defaultValue === null) {
        return <span className="text-muted-foreground">None</span>
      }

      return <span>{defaultValue}</span>
    }
  },
  {
    id: "optionCount",
    accessorFn: (field) =>
      field.type === AssetCustomFieldType.Select ? field.options.length : null,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Options" />
    ),
    cell: ({ row }) => {
      if (row.original.type !== AssetCustomFieldType.Select) {
        return <span className="text-muted-foreground">-</span>
      }

      return (
        <Badge variant="outline" className="rounded-full">
          {row.original.options.length} option
          {row.original.options.length === 1 ? "" : "s"}
        </Badge>
      )
    },
    enableColumnFilter: false
  }
]
