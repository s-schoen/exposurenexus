import { AssetCustomFieldType } from "@exposurenexus/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetWithCustomFields
} from "@exposurenexus/types/model/asset"
import type { UserProfile } from "@exposurenexus/types/model/user"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import {
  UserLabel,
  formatUserProfileReference
} from "@/components/user-label.tsx"

import { formatAssetCustomFieldValue } from "@/lib/asset-custom-fields.ts"
import { capitalizeFirstLetter } from "@/lib/format.ts"

const emptyCustomFieldFilterValue = "__empty__"

export function getAssetCustomFieldColumnId(fieldId: string) {
  return `custom-field:${fieldId}`
}

function createBaseColumns(
  userProfileById: Map<string, UserProfile>,
  usersLoading = false
): Array<ColumnDef<AssetWithCustomFields>> {
  return [
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
    },
    {
      id: "ownerId",
      accessorFn: (asset) =>
        formatUserProfileReference(asset.ownerId, userProfileById, {
          emptyLabel: "No Owner",
          unknownLabel: "Unknown Owner"
        }),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Owner" />
      ),
      cell: ({ row }) => (
        <UserLabel
          userId={row.original.ownerId}
          user={
            row.original.ownerId && usersLoading
              ? undefined
              : row.original.ownerId
                ? (userProfileById.get(row.original.ownerId) ?? null)
                : null
          }
          emptyLabel="No Owner"
          unknownLabel="Unknown Owner"
        />
      ),
      meta: {
        label: "Owner"
      }
    }
  ]
}

function createCustomFieldColumn(
  definition: AssetCustomFieldDefinition
): ColumnDef<AssetWithCustomFields> {
  const columnId = getAssetCustomFieldColumnId(definition.id)
  const filterVariant = (() => {
    switch (definition.type) {
      case AssetCustomFieldType.Number:
        return "number" as const
      case AssetCustomFieldType.Select:
        return "select" as const
      case AssetCustomFieldType.Text:
        return "text" as const
    }
  })()

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
    filterFn: (row, _columnId, filterValue: Array<string> | string) => {
      const value = row.original.customFields.find(
        (field) => field.fieldId === definition.id
      )

      switch (definition.type) {
        case AssetCustomFieldType.Number: {
          if (typeof filterValue !== "string" || !filterValue.trim()) {
            return true
          }

          const parsedFilterValue = Number(filterValue)

          return (
            Number.isFinite(parsedFilterValue) &&
            typeof value?.value === "number" &&
            value.value === parsedFilterValue
          )
        }
        case AssetCustomFieldType.Select: {
          if (!Array.isArray(filterValue) || filterValue.length === 0) {
            return true
          }

          const resolvedValue =
            value?.value === null || typeof value === "undefined"
              ? emptyCustomFieldFilterValue
              : String(value.value)

          return filterValue.includes(resolvedValue)
        }
        case AssetCustomFieldType.Text: {
          if (typeof filterValue !== "string" || !filterValue.trim()) {
            return true
          }

          return formatAssetCustomFieldValue(value)
            .toLocaleLowerCase()
            .includes(filterValue.toLocaleLowerCase())
        }
      }
    },
    meta: {
      label: definition.name,
      filterVariant,
      ...(definition.type === AssetCustomFieldType.Select
        ? {
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
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  userProfileById: Map<string, UserProfile> = new Map(),
  usersLoading = false
): Array<ColumnDef<AssetWithCustomFields>> {
  return [
    ...createBaseColumns(userProfileById, usersLoading),
    ...customFieldDefinitions.map((definition) =>
      createCustomFieldColumn(definition)
    )
  ]
}
