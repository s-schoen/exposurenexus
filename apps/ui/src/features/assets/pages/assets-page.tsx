import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Server } from "lucide-react";
import { useMemo } from "react";

import { DetailPeek } from "@/components/detail-peek.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { RecordMenu } from "@/components/record-menu.tsx";
import { AssetDetailContent } from "@/features/assets/components/asset-detail-content.tsx";
import { AssetList } from "@/features/assets/components/asset-list/index.tsx";
import { useAssetRecordActions } from "@/features/assets/hooks/use-asset-record-actions.ts";
import {
  createAssetListOptionsFromSearch,
  useAssetTableSearchState,
} from "@/features/assets/hooks/use-asset-table-search-state.ts";
import { useCreateAsset } from "@/features/assets/hooks/use-create-asset.ts";
import {
  createAssetByIDQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { useSelectedSearchParam } from "@/hooks/use-selected-search-param.ts";

import type { FindingCountByAssetId } from "@/features/assets/components/asset-list/columns.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { ReactNode } from "react";

interface AssetsPageProps {
  search?: Record<string, unknown>;
  selected?: string;
  /** Each asset's finding count. The route reads it from the findings feature. */
  findingCountByAssetId?: FindingCountByAssetId;
  /** The findings section for an asset's peek. The route renders it from the findings feature. */
  renderAssetFindings?: (assetId: string) => ReactNode;
}

export function AssetsPage({
  search = {},
  selected,
  findingCountByAssetId,
  renderAssetFindings,
}: AssetsPageProps) {
  const customFieldDefinitionsQuery = useSuspenseQuery(
    createListAssetCustomFieldDefinitionsQueryOptions(),
  );
  const customFieldDefinitions = customFieldDefinitionsQuery.data;
  const assetListOptions = createAssetListOptionsFromSearch(search, customFieldDefinitions);
  const createAsset = useCreateAsset();
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

  const actions = useMemo(
    () => [
      {
        label: "New asset",
        icon: Plus,
        onClick: () => {
          void createAsset();
        },
      },
    ],
    [createAsset],
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
          void createAsset();
        }}
      />
      <DetailPeek
        selectedId={selectedSearch.selectedId}
        label="Asset details"
        getFullPageHref={(id) => `/assets/${id}`}
        menu={(id) => <AssetPeekMenu assetId={id} />}
        onClose={() => {
          void selectedSearch.clearSelected();
        }}
      >
        {(id) => <AssetDetailPreview assetId={id} findingsSection={renderAssetFindings?.(id)} />}
      </DetailPeek>
    </>
  );
}

function AssetRecordMenu({ asset }: { asset: Asset }) {
  return <RecordMenu actions={useAssetRecordActions(asset)} />;
}

/** The peek header's ⋯ menu. It waits for the preview's fetch instead of fetching again. */
function AssetPeekMenu({ assetId }: { assetId: string }) {
  const asset = useQuery({ ...createAssetByIDQueryOptions(assetId), enabled: false });

  return asset.data ? <AssetRecordMenu asset={asset.data} /> : null;
}

function AssetDetailPreview({
  assetId,
  findingsSection,
}: {
  assetId: string;
  findingsSection?: ReactNode;
}) {
  const asset = useQuery(createAssetByIDQueryOptions(assetId));

  return (
    <DetailQueryBoundary
      query={asset}
      title="Asset details"
      errorTitle="Unable to load asset"
      errorDescription="The selected asset could not be loaded."
      missingMessage="The API did not return an asset record."
    >
      {(assetData) => <AssetDetailContent asset={assetData} findingsSection={findingsSection} />}
    </DetailQueryBoundary>
  );
}
