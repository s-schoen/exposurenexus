import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetWithCustomFields
} from "@openvlp/types/model/asset"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"

import { formatAssetCustomFieldValue } from "@/lib/asset-custom-fields.ts"
import { capitalizeFirstLetter } from "@/lib/format.ts"

const emptyCustomFieldFilterValue = "__empty__"

export function getAssetCustomFieldColumnId(fieldId: string) {
  return `custom-field:${fieldId}`
}

const baseColumns: Array<ColumnDef<AssetWithCustomFields>> = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    meta: {
      label: "Name"
    }
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      return <span>{capitalizeFirstLetter(row.getValue("type"))}</span>
    },
    meta: {
      label: "Type"
    }
  }
]

function createCustomFieldColumn(
  definition: AssetCustomFieldDefinition
): ColumnDef<AssetWithCustomFields> {
  const columnId = getAssetCustomFieldColumnId(definition.id)

  return {
    id: columnId,
    accessorFn: (asset) =>
      formatAssetCustomFieldValue(
        asset.customFields.find((field) => field.fieldId === definition.id)
      ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={definition.name} />
    ),
    cell: ({ getValue }) => {
      const value = getValue<string>()

      return (
        <span className={value === "None" ? "text-muted-foreground" : ""}>
          {value}
        </span>
      )
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true
      }

      const value = row.original.customFields.find(
        (field) => field.fieldId === definition.id
      )
      const resolvedValue =
        value?.value === null || typeof value === "undefined"
          ? emptyCustomFieldFilterValue
          : String(value.value)

      return filterValue.includes(resolvedValue)
    },
    meta: {
      label: definition.name,
      ...(definition.type === AssetCustomFieldType.Select
        ? {
            filterVariant: "select" as const,
            options: [
              { label: "None", value: emptyCustomFieldFilterValue },
              ...definition.options.map((option) => ({
                label: option.label,
                value: option.value
              }))
            ]
          }
        : {})
    }
  }
}

export function createAssetTableColumns(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): Array<ColumnDef<AssetWithCustomFields>> {
  return [
    ...baseColumns,
    ...customFieldDefinitions.map((definition) =>
      createCustomFieldColumn(definition)
    )
  ]
}
