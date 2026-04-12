import { Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Asset } from "@openvlp/types/model/asset"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { columns } from "@/components/asset-table/columns.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import {
  createAsset,
  createListAssetsQueryOptions,
  deleteAsset
} from "@/api/asset.ts"
import { AssetDialog } from "@/components/asset-dialog.tsx"

export function AssetTable() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assetsQuery = useQuery(createListAssetsQueryOptions())

  const handleOpenAsset = async (asset: Asset) => {
    await navigate({
      to: "/assets/$id",
      params: {
        id: asset.id
      }
    })
  }

  const handleDeleteAssets = async (assets: Array<Asset>) => {
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
          toast.error(`Failed to delete asset ${asset.id}: ${error}`)
          console.error(error)
        }
      }
      if (success) {
        toast.success(`Deleted ${assets.length} asset(s)!`)
      }
      queryClient.invalidateQueries({
        queryKey: createListAssetsQueryOptions().queryKey
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
      } catch (error) {
        toast.error(`Failed to create asset: ${error}`)
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
      columns={columns}
      query={assetsQuery}
      onRowDoubleClick={handleOpenAsset}
      onRowDelete={handleDeleteAssets}
      toolbarControls={ToolbarElements()}
    />
  )
}
