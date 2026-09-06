import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { AssetTable } from "@/features/assets/components/asset-table/index.tsx";
import {
  createAssetListOptionsFromSearch,
  useAssetTableSearchState,
} from "@/features/assets/hooks/use-asset-table-search-state.ts";
import { createAssetByIDQueryOptions } from "@/features/assets/queries/assets.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { Asset } from "@exposurenexus/contracts/model/asset";

interface AssetsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
}

export function AssetsPage({ search = {}, selected }: AssetsPageProps) {
  const customFieldDefinitionsQuery = useSuspenseQuery(
    createListAssetCustomFieldDefinitionsQueryOptions(),
  );
  const customFieldDefinitions = customFieldDefinitionsQuery.data;
  const assetListOptions = createAssetListOptionsFromSearch(search, customFieldDefinitions);
  const { filterState, onFilterStateChange } = useAssetTableSearchState({
    search,
    customFieldDefinitions,
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
        assetListOptions={assetListOptions}
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
        {selected && <AssetDetailPreview assetId={selected} />}
      </DetailPreviewDialog>
    </>
  );
}

function AssetDetailPreview({ assetId }: { assetId: string }) {
  const asset = useQuery(createAssetByIDQueryOptions(assetId));

  return (
    <DetailQueryBoundary
      query={asset}
      title="Asset details"
      errorTitle="Unable to load asset"
      errorDescription="The selected asset could not be loaded."
      missingMessage="The API did not return an asset record."
    >
      {(assetData) => <AssetDetailContent asset={assetData} />}
    </DetailQueryBoundary>
  );
}
