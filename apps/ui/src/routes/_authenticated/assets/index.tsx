import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { AssetTable } from "@/components/asset-table"

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()

  usePageMeta({
    title: "Assets",
    description: "View systems in scope."
  })

  return (
    <>
      <AssetTable
        selectedAssetId={selected}
        onSelectAsset={(asset) =>
          navigate({
            to: "/assets",
            search: (prev) => ({
              ...prev,
              selected: asset.id
            })
          })
        }
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/assets",
            search: (prev) => ({
              ...prev,
              selected: undefined
            })
          })
        }
        title="Asset details"
        description="Review the selected asset without leaving the asset table."
        fullPageHref={selected ? `/assets/${selected}` : undefined}
      >
        {selected && <AssetDetailContent assetId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
