import { DataTable } from "@/components/data-table/data-table.tsx"
import { useAssets } from "@/hooks/use-assets.ts"
import { columns } from "@/components/asset-table/columns.tsx"
import type { Asset } from "@openvlp/types/model/asset"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { useNavigate } from "@tanstack/react-router"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"
import { useMutation } from "@tanstack/react-query"
import { createAsset, deleteAsset } from "@/api/asset.ts"
import { toast } from "sonner"
import { AssetDialog } from "@/components/asset-dialog.tsx"

export function AssetTable() {
  const navigate = useNavigate()
  const assetsQuery = useAssets()

  const mutateDeleteAsset = useMutation({
    mutationFn: (id: string) => deleteAsset(id)
  })
  const mutateCreateAsset = useMutation({
    mutationFn: (a: Asset) => createAsset(a.name, a.type),
    onSuccess: async (createdAsset) => {
      toast.success(`Created new asset ${createdAsset.name}`)
      await assetsQuery.refetch()
    }
  })

  const handleOpenAsset = async (asset: Asset) => {
    await navigate({
      to: "/assets/$id",
      params: {
        id: asset.id
      }
    })
  }

  const handleDeleteAssets = async (assets: Asset[]) => {
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
          await mutateDeleteAsset.mutateAsync(asset.id)
        } catch (error) {
          success = false
          toast.error(`Failed to delete asset ${asset.id}: ${error}`)
          console.error(error)
        }
      }
      if (success) {
        toast.success(`Deleted ${assets.length} asset(s)!`)
      }
      await assetsQuery.refetch()
    }
  }

  const handleCreateAsset = async () => {
    const assetToCreate = await AssetDialog.call({})

    if (assetToCreate) {
      await mutateCreateAsset.mutateAsync(assetToCreate)
    }
  }

  function ToolbarElements() {
    return (
      <Button
        variant="outline"
        size="sm"
        className="ml-auto hidden h-8 lg:flex"
        onClick={handleCreateAsset}
      >
        <Plus />
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
