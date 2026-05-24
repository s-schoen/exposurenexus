import { useQuery } from "@tanstack/react-query"
import type { Asset } from "@exposurenexus/types/model/asset"
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/api/asset-custom-field.ts"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"
import { AssetTable } from "@/components/asset-table"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { useAssetTableSearchState } from "@/hooks/use-asset-table-search-state.ts"
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts"

interface AssetsRouteComponentProps {
  search?: Record<string, unknown>
  selected?: string
}

export function AssetsRouteComponent({
  search = {},
  selected
}: AssetsRouteComponentProps) {
  const customFieldDefinitionsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const { filterState, onFilterStateChange } = useAssetTableSearchState({
    search,
    customFieldDefinitions: customFieldDefinitionsQuery.data ?? []
  })
  const selectedSearch = useSelectedSearchParam<Asset>({
    selectedId: selected,
    to: "/assets",
    getId: (asset) => asset.id
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
        selectedAssetId={selectedSearch.selectedId}
        onSelectAsset={(asset) => {
          void selectedSearch.selectRow(asset)
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected()
        }}
        title="Asset details"
        description="Review the selected asset without leaving the asset table."
        fullPageHref={selected ? `/assets/${selected}` : undefined}
      >
        {selected && <AssetDetailContent assetId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
