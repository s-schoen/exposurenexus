import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { AssetTable } from "@/components/asset-table"
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/api/asset-custom-field.ts"
import {
  useAssetTableSearchState,
  validateAssetTableSearch
} from "@/hooks/use-asset-table-search-state.ts"

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined,
    ...validateAssetTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { selected } = search
  const customFieldDefinitionsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const { filterState, onFilterStateChange } = useAssetTableSearchState({
    search,
    customFieldDefinitions: customFieldDefinitionsQuery.data ?? []
  })

  usePageMeta({
    title: "Assets",
    description: "View systems in scope."
  })

  return (
    <>
      <AssetTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedAssetId={selected}
        onSelectAsset={(asset) =>
          navigate({
            to: "/assets",
            search: (prev) => ({
              ...prev,
              filter: prev.filter,
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
              filter: prev.filter,
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
