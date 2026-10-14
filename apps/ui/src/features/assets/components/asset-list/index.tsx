import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Server } from "lucide-react";
import { useMemo } from "react";

import { DataList } from "@/components/data-list/data-list.tsx";
import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  createAssetColumns,
  getAssetCustomFieldColumnId,
} from "@/features/assets/components/asset-list/columns.tsx";
import { AssetTypeIcon } from "@/features/assets/components/asset-type-icon.tsx";
import { useDeleteAssets } from "@/features/assets/hooks/use-asset-record-actions.ts";
import { formatAssetType } from "@/features/assets/lib/asset-type.ts";
import { createListAssetsWithCustomFieldsQueryOptions } from "@/features/assets/queries/assets.ts";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import {
  OWNER_LABELS,
  createListUsersQueryOptions,
  createUserProfileById,
  formatUserProfileReference,
} from "@/features/users";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { AssetListOptions } from "@/features/assets/api/assets.ts";
import type { FindingCountByAssetId } from "@/features/assets/components/asset-list/columns.tsx";
import type { Asset, AssetType, AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const noFindingCounts: FindingCountByAssetId = {};

export function createAssetGroupingOptions(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  userProfileById: Map<string, UserProfile> = new Map(),
): Array<GroupingOption> {
  return [
    {
      id: "type",
      label: "Type",
      formatValue: (value) => formatAssetType(value as AssetType),
      renderIcon: (value) => <AssetTypeIcon type={value as AssetType} decorative />,
    },
    {
      id: "ownerId",
      label: "Owner",
      formatValue: (value) =>
        typeof value === "string"
          ? value
          : formatUserProfileReference(null, userProfileById, OWNER_LABELS),
    },
    ...customFieldDefinitions.map((definition) => ({
      id: getAssetCustomFieldColumnId(definition.id),
      label: definition.name,
      formatValue: (value: unknown) =>
        typeof value === "string" && value.length > 0 ? value : "None",
    })),
  ];
}

interface AssetListProps {
  assetListOptions?: AssetListOptions;
  findingCountByAssetId?: FindingCountByAssetId;
  grouping?: string;
  onGroupingChange?: (grouping: string | undefined) => void;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedAssetId?: string;
  onSelectAsset?: (asset: Asset) => void;
  onCreateAsset?: () => void;
}

export function AssetList({
  assetListOptions,
  findingCountByAssetId = noFindingCounts,
  grouping,
  onGroupingChange,
  filterState,
  onFilterStateChange,
  selectedAssetId,
  onSelectAsset,
  onCreateAsset,
}: AssetListProps = {}) {
  const navigate = useNavigate();
  const deleteAssets = useDeleteAssets();
  const assetsQuery = useSuspenseQuery(
    createListAssetsWithCustomFieldsQueryOptions(assetListOptions),
  );
  const usersQuery = useSuspenseQuery(createListUsersQueryOptions());
  const customFieldDefinitionsQuery = useSuspenseQuery(
    createListAssetCustomFieldDefinitionsQueryOptions(),
  );
  const customFieldDefinitions = customFieldDefinitionsQuery.data;
  const userProfileById = useMemo(() => createUserProfileById(usersQuery.data), [usersQuery.data]);
  const columns = useMemo(
    () =>
      createAssetColumns(
        customFieldDefinitions,
        findingCountByAssetId,
        userProfileById,
        usersQuery.isPending,
      ),
    [customFieldDefinitions, findingCountByAssetId, userProfileById, usersQuery.isPending],
  );
  const groupingOptions = useMemo(
    () => createAssetGroupingOptions(customFieldDefinitions, userProfileById),
    [customFieldDefinitions, userProfileById],
  );
  // Type, owner and finding count by default; the rest can be turned on under Display.
  const initialColumnVisibility = useMemo(
    () => ({
      identifiers: false,
      environment: false,
      lifecycleState: false,
      ...Object.fromEntries(
        customFieldDefinitions.map((definition) => [
          getAssetCustomFieldColumnId(definition.id),
          false,
        ]),
      ),
    }),
    [customFieldDefinitions],
  );

  const handleOpenAsset = async (asset: AssetWithCustomFields) => {
    await navigate({
      to: "/assets/$id",
      params: {
        id: asset.id,
      },
    });
  };

  return (
    <DataList
      label="Assets"
      columns={columns}
      query={assetsQuery}
      getRowId={(asset) => asset.id}
      getRowHref={(asset) => `/assets/${asset.id}`}
      groupingOptions={groupingOptions}
      grouping={grouping}
      onGroupingChange={onGroupingChange}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      initialColumnVisibility={initialColumnVisibility}
      onRowClick={onSelectAsset}
      onRowDoubleClick={handleOpenAsset}
      isRowActive={(asset) => asset.id === selectedAssetId}
      onRowDelete={deleteAssets}
      emptyState={
        <DataListEmpty icon={Server} message="No assets yet.">
          {onCreateAsset && (
            <Button variant="outline" onClick={onCreateAsset}>
              <Plus />
              New asset
            </Button>
          )}
        </DataListEmpty>
      }
    />
  );
}
