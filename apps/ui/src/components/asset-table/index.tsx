import { Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useMemo } from "react"
import type {
  Asset,
  AssetCustomFieldDefinition,
  AssetWithCustomFields
} from "@openvlp/types/model/asset"
import type { GroupingOption } from "@/components/data-table/types.ts"
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
import { AssetDialog } from "@/components/asset-dialog.tsx"
import { capitalizeFirstLetter } from "@/lib/format.ts"
import { toastActionError } from "@/lib/action-error-toast.ts"

export function createAssetTableGroupingOptions(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>
): Array<GroupingOption> {
  return [
    {
      id: "type",
      label: "Type",
      formatValue: (value) => capitalizeFirstLetter(String(value))
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
  const queryClient = useQueryClient()
  const assetsQuery = useQuery(createListAssetsWithCustomFieldsQueryOptions())
  const customFieldDefinitionsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const tableColumns = useMemo(
    () => createAssetTableColumns(customFieldDefinitionsQuery.data ?? []),
    [customFieldDefinitionsQuery.data]
  )
  const groupingOptions = useMemo(
    () => createAssetTableGroupingOptions(customFieldDefinitionsQuery.data ?? []),
    [customFieldDefinitionsQuery.data]
  )
  const initialColumnVisibility = useMemo(
    () =>
      Object.fromEntries(
        (customFieldDefinitionsQuery.data ?? []).map((definition) => [
          getAssetCustomFieldColumnId(definition.id),
          false
        ])
      ),
    [customFieldDefinitionsQuery.data]
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
        await createAsset(assetToCreate.name, assetToCreate.type)
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
    />
  )
}
