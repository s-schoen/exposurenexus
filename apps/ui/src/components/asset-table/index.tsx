import { DataTable } from "@/components/data-table/data-table.tsx"
import { useAssets } from "@/hooks/use-assets.ts"
import { columns } from "@/components/asset-table/columns.tsx"
import type { Asset } from "@openvlp/types/model/asset"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { useNavigate } from "@tanstack/react-router"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"

export function AssetTable() {
  const navigate = useNavigate()

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
      description: "This action cannot be undone.",
      message: `Are you sure you want to delete ${assets.length} asset(s)?`,
      confirmVariant: "destructive"
    })

    if (confirmed) {
      // TODO: delete using API
      console.log(assets)
    }
  }

  function ToolbarElements() {
    return (
      <Button
        variant="outline"
        size="sm"
        className="ml-auto hidden h-8 lg:flex"
      >
        <Plus />
      </Button>
    )
  }

  return (
    <DataTable
      columns={columns}
      query={useAssets()}
      onRowDoubleClick={handleOpenAsset}
      onRowDelete={handleDeleteAssets}
      toolbarControls={ToolbarElements()}
    />
  )
}
