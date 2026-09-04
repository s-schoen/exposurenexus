import { useQuery } from "@tanstack/react-query";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { AssetTable } from "@/features/assets/components/asset-table/index.tsx";
import { useAssetTableSearchState } from "@/features/assets/hooks/use-asset-table-search-state.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Asset } from "@exposurenexus/contracts/model/asset";

interface AssetsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function AssetsPage({ search = {}, selected }: AssetsPageProps) {
  const customFieldDefinitionsQuery = useQuery(createListAssetCustomFieldDefinitionsQueryOptions());
  const { filterState, onFilterStateChange } = useAssetTableSearchState({
    search,
    customFieldDefinitions: customFieldDefinitionsQuery.data ?? [],
  });
  const selectedSearch = useSelectedSearchParam<Asset>({
    selectedId: selected,
    to: "/assets",
    getId: (asset) => asset.id,
  });

  usePageMeta({
    title: "Assets",
    description: "View systems in scope.",
  });

  return (
    <>
      <AssetTable
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedAssetId={selectedSearch.selectedId}
        onSelectAsset={(asset) => {
          void selectedSearch.selectRow(asset);
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
        title="Asset details"
        description="Review the selected asset without leaving the asset table."
        fullPageHref={selected ? `/assets/${selected}` : undefined}
      >
        {selected && <AssetDetailContent assetId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}
