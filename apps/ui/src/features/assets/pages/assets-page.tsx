import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Server } from "lucide-react";
import { useCallback, useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { AssetDialog } from "@/features/assets/components/asset-dialog.tsx";
import { AssetList } from "@/features/assets/components/asset-list/index.tsx";
import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import {
  createAssetListOptionsFromSearch,
  useAssetTableSearchState,
} from "@/features/assets/hooks/use-asset-table-search-state.ts";
import {
  createAssetByIDQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { FindingCountByAssetId } from "@/features/assets/components/asset-list/columns.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";

interface AssetsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
  /** Each asset's finding count. The route reads it from the findings feature. */
  findingCountByAssetId?: FindingCountByAssetId;
}

export function AssetsPage({ search = {}, selected, findingCountByAssetId }: AssetsPageProps) {
  const customFieldDefinitionsQuery = useSuspenseQuery(
    createListAssetCustomFieldDefinitionsQueryOptions(),
  );
  const customFieldDefinitions = customFieldDefinitionsQuery.data;
  const assetListOptions = createAssetListOptionsFromSearch(search, customFieldDefinitions);
  const assetLifecycle = useAssetLifecycle();
  const { filterState, onFilterStateChange, grouping, onGroupingChange } = useAssetTableSearchState(
    {
      search,
      customFieldDefinitions,
    },
  );
  const assets = useSuspenseQuery(createListAssetsWithCustomFieldsQueryOptions(assetListOptions));
  const selectedSearch = useSelectedSearchParam<Asset>({
    selectedId: selected,
    to: "/assets",
    getId: (asset) => asset.id,
  });

  const handleCreateAsset = useCallback(async () => {
    const assetToCreate = await AssetDialog.call({});

    if (assetToCreate) {
      await assetLifecycle.createAsset(assetToCreate);
    }
  }, [assetLifecycle]);
  const actions = useMemo(
    () => [
      {
        label: "New asset",
        icon: Plus,
        onClick: () => {
          void handleCreateAsset();
        },
      },
    ],
    [handleCreateAsset],
  );

  usePageMeta({
    title: "Assets",
    icon: Server,
    count: assets.data.length,
    actions,
  });

  return (
    <>
      <AssetList
        assetListOptions={assetListOptions}
        findingCountByAssetId={findingCountByAssetId}
        grouping={grouping}
        onGroupingChange={onGroupingChange}
        filterState={filterState}
        onFilterStateChange={onFilterStateChange}
        selectedAssetId={selectedSearch.selectedId}
        onSelectAsset={(asset) => {
          void selectedSearch.selectRow(asset);
        }}
        onCreateAsset={() => {
          void handleCreateAsset();
        }}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Asset details"
        getFullPageHref={(id) => `/assets/${id}`}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <AssetDetailPreview assetId={id} />}
      </DetailPeek>
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
