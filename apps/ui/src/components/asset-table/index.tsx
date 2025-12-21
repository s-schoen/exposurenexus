import { DataTable } from "@/components/data-table/data-table.tsx"
import { useAssets } from "@/hooks/use-assets.ts"
import { columns } from "@/components/asset-table/columns.tsx"
import type { Asset } from "@openvlp/types/model/asset"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { useNavigate } from "@tanstack/react-router"

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
      toolbarControls={ToolbarElements()}
    />
  )
}
