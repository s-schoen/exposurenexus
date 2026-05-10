import { Plus } from "lucide-react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useMemo, useState } from "react"
import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field"
import type {
  Asset,
  AssetWithCustomFields
} from "@exposurenexus/types/model/asset"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"
import type { UserProfile } from "@exposurenexus/types/model/user"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import {
  createAssetTableColumns,
  getAssetCustomFieldColumnId
} from "@/components/asset-table/columns.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import {
  createAsset,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
  deleteAsset
} from "@/api/asset.ts"
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/api/asset-custom-field.ts"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { AssetDialog } from "@/components/asset-dialog.tsx"
import {
  createUserProfileById,
  formatUserProfileReference
} from "@/components/user-label.tsx"
import { capitalizeFirstLetter } from "@/lib/format.ts"
import { toastActionError } from "@/lib/action-error-toast.ts"

interface AssetCustomFieldFilterSearchState {
  select: Record<string, Array<string>>
  text: Record<string, string>
  number: Record<string, string>
}

const emptyCustomFieldFilterSearchState: AssetCustomFieldFilterSearchState = {
  select: {},
  text: {},
  number: {}
}

const reservedAssetTableSearchParams = new Set([
  "customFields",
  "filter",
  "selected"
])

function getSearchParamString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(",")
  }

  return undefined
}

function getFilterValue(
  filters: Partial<Record<string, string>> | undefined,
  columnId: string
) {
  const value = filters?.[columnId]

  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

export function isAssetTableReservedSearchParam(key: string) {
  return reservedAssetTableSearchParams.has(key)
}

export function parseAssetCustomFieldFiltersFromSearch(
  search: Record<string, unknown>,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): AssetCustomFieldFilterSearchState {
  return customFieldDefinitions.reduce<AssetCustomFieldFilterSearchState>(
    (filters, definition) => {
      if (isAssetTableReservedSearchParam(definition.key)) {
        return filters
      }

      const value = getSearchParamString(search[definition.key])
      const columnId = getAssetCustomFieldColumnId(definition.id)

      if (!value || value.trim().length === 0) {
        return filters
      }

      switch (definition.type) {
        case AssetCustomFieldType.Number:
          filters.number[columnId] = value
          return filters
        case AssetCustomFieldType.Select: {
          const values = value.split(",").filter(Boolean)

          if (values.length > 0) {
            filters.select[columnId] = values
          }

          return filters
        }
        case AssetCustomFieldType.Text:
          filters.text[columnId] = value
          return filters
      }
    },
    {
      select: {},
      text: {},
      number: {}
    }
  )
}

export function createAssetCustomFieldSearchParams(
  filterState: DataTableFilterState,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): Record<string, string> {
  return Object.fromEntries(
    customFieldDefinitions.flatMap((definition) => {
      if (isAssetTableReservedSearchParam(definition.key)) {
        return []
      }

      const columnId = getAssetCustomFieldColumnId(definition.id)

      switch (definition.type) {
        case AssetCustomFieldType.Number: {
          const value = getFilterValue(filterState.numberFilters, columnId)
          return value ? [[definition.key, value]] : []
        }
        case AssetCustomFieldType.Select: {
          const values = filterState.selectFilters[columnId] ?? []
          return values.length > 0 ? [[definition.key, values.join(",")]] : []
        }
        case AssetCustomFieldType.Text: {
          const value = getFilterValue(filterState.textFilters, columnId)
          return value ? [[definition.key, value]] : []
        }
      }
    })
  )
}

export function createClearedAssetCustomFieldSearchParams(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): Record<string, undefined> {
  return {
    customFields: undefined,
    ...Object.fromEntries(
      customFieldDefinitions
        .filter(
          (definition) => !isAssetTableReservedSearchParam(definition.key)
        )
        .map((definition) => [definition.key, undefined])
    )
  }
}

export function createReservedAssetCustomFieldFilterState(
  filterState: DataTableFilterState,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): AssetCustomFieldFilterSearchState {
  return customFieldDefinitions.reduce<AssetCustomFieldFilterSearchState>(
    (filters, definition) => {
      if (!isAssetTableReservedSearchParam(definition.key)) {
        return filters
      }

      const columnId = getAssetCustomFieldColumnId(definition.id)

      switch (definition.type) {
        case AssetCustomFieldType.Number: {
          const value = getFilterValue(filterState.numberFilters, columnId)
          if (value) {
            filters.number[columnId] = value
          }
          return filters
        }
        case AssetCustomFieldType.Select: {
          const values = filterState.selectFilters[columnId] ?? []
          if (values.length > 0) {
            filters.select[columnId] = values
          }
          return filters
        }
        case AssetCustomFieldType.Text: {
          const value = getFilterValue(filterState.textFilters, columnId)
          if (value) {
            filters.text[columnId] = value
          }
          return filters
        }
      }
    },
    {
      select: {},
      text: {},
      number: {}
    }
  )
}

function mergeAssetCustomFieldFilterSearchStates(
  primary: AssetCustomFieldFilterSearchState,
  secondary: AssetCustomFieldFilterSearchState
): AssetCustomFieldFilterSearchState {
  return {
    select: {
      ...primary.select,
      ...secondary.select
    },
    text: {
      ...primary.text,
      ...secondary.text
    },
    number: {
      ...primary.number,
      ...secondary.number
    }
  }
}

export function createAssetTableGroupingOptions(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  userProfileById: Map<string, UserProfile> = new Map()
): Array<GroupingOption> {
  return [
    {
      id: "type",
      label: "Type",
      formatValue: (value) => capitalizeFirstLetter(String(value))
    },
    {
      id: "ownerId",
      label: "Owner",
      formatValue: (value) =>
        typeof value === "string"
          ? value
          : formatUserProfileReference(null, userProfileById, {
              emptyLabel: "No Owner",
              unknownLabel: "Unknown Owner"
            })
    },
    ...customFieldDefinitions.map((definition) => ({
      id: getAssetCustomFieldColumnId(definition.id),
      label: definition.name,
      formatValue: (value: unknown) =>
        typeof value === "string" && value.length > 0 ? value : "None"
    }))
  ]
}

interface AssetTableProps {
  selectedAssetId?: string
  onSelectAsset?: (asset: Asset) => void
}

export function AssetTable({
  selectedAssetId,
  onSelectAsset
}: AssetTableProps = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const assetsQuery = useQuery(createListAssetsWithCustomFieldsQueryOptions())
  const usersQuery = useQuery(createListUsersQueryOptions())
  const customFieldDefinitionsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const customFieldDefinitions = customFieldDefinitionsQuery.data ?? []
  const userProfileById = useMemo(
    () => createUserProfileById(usersQuery.data),
    [usersQuery.data]
  )
  const [reservedCustomFieldFilters, setReservedCustomFieldFilters] =
    useState<AssetCustomFieldFilterSearchState>(
      emptyCustomFieldFilterSearchState
    )
  const tableColumns = useMemo(
    () =>
      createAssetTableColumns(
        customFieldDefinitions,
        userProfileById,
        usersQuery.isPending
      ),
    [customFieldDefinitions, userProfileById, usersQuery.isPending]
  )
  const groupingOptions = useMemo(
    () =>
      createAssetTableGroupingOptions(customFieldDefinitions, userProfileById),
    [customFieldDefinitions, userProfileById]
  )
  const initialColumnVisibility = useMemo(
    () =>
      Object.fromEntries(
        customFieldDefinitions.map((definition) => [
          getAssetCustomFieldColumnId(definition.id),
          false
        ])
      ),
    [customFieldDefinitions]
  )
  const customFieldFilters = useMemo(
    () =>
      mergeAssetCustomFieldFilterSearchStates(
        parseAssetCustomFieldFiltersFromSearch(
          location.search as Record<string, unknown>,
          customFieldDefinitions
        ),
        reservedCustomFieldFilters
      ),
    [customFieldDefinitions, location.search, reservedCustomFieldFilters]
  )
  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter:
        typeof location.search.filter === "string"
          ? location.search.filter
          : "",
      selectFilters: customFieldFilters.select,
      textFilters: customFieldFilters.text,
      numberFilters: customFieldFilters.number
    }),
    [customFieldFilters, location.search.filter]
  )

  const handleOpenAsset = async (asset: AssetWithCustomFields) => {
    await navigate({
      to: "/assets/$id",
      params: {
        id: asset.id
      }
    })
  }

  const handleDeleteAssets = async (assets: Array<AssetWithCustomFields>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Assets",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${assets.length} asset(s)?`,
      confirmVariant: "destructive"
    })

    if (confirmed) {
      let success = true
      for (const asset of assets) {
        try {
          await deleteAsset(asset.id)
        } catch (error) {
          success = false
          toastActionError(
            error,
            `Failed to delete asset ${asset.id}: ${error}`
          )
          console.error(error)
        }
      }
      if (success) {
        toast.success(`Deleted ${assets.length} asset(s)!`)
      }
      queryClient.invalidateQueries({
        queryKey: createListAssetsQueryOptions().queryKey
      })
      queryClient.invalidateQueries({
        queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey
      })
    }
  }

  const handleCreateAsset = async () => {
    const assetToCreate = await AssetDialog.call({})

    if (assetToCreate) {
      try {
        await createAsset(
          assetToCreate.name,
          assetToCreate.type,
          assetToCreate.ownerId
        )
        toast.success(`Created new asset ${assetToCreate.name}`)
        queryClient.invalidateQueries({
          queryKey: createListAssetsQueryOptions().queryKey
        })
        queryClient.invalidateQueries({
          queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey
        })
      } catch (error) {
        toastActionError(error, `Failed to create asset: ${error}`)
        console.error(error)
      }
    }
  }

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    const nextReservedCustomFieldFilters =
      createReservedAssetCustomFieldFilterState(
        nextState,
        customFieldDefinitions
      )
    const nextCustomFieldSearchParams = createAssetCustomFieldSearchParams(
      nextState,
      customFieldDefinitions
    )

    setReservedCustomFieldFilters(nextReservedCustomFieldFilters)

    void navigate({
      to: "/assets",
      replace: true,
      search: (prev) => ({
        ...prev,
        selected: prev.selected,
        filter: nextState.globalFilter ? nextState.globalFilter : undefined,
        ...createClearedAssetCustomFieldSearchParams(customFieldDefinitions),
        ...nextCustomFieldSearchParams
      })
    })
  }

  function ToolbarElements() {
    return (
      <Button
        variant="default"
        size="sm"
        className="h-9 rounded-xl"
        onClick={handleCreateAsset}
      >
        <Plus />
        New asset
      </Button>
    )
  }

  return (
    <DataTable
      columns={tableColumns}
      query={assetsQuery}
      groupingOptions={groupingOptions}
      onRowClick={onSelectAsset}
      onRowDoubleClick={handleOpenAsset}
      isRowActive={(asset) => asset.id === selectedAssetId}
      onRowDelete={handleDeleteAssets}
      toolbarControls={ToolbarElements()}
      initialColumnVisibility={initialColumnVisibility}
      filterState={filterState}
      onFilterStateChange={handleFilterStateChange}
    />
  )
}
