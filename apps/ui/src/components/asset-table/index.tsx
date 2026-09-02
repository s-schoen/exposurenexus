import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";

import { createListAssetsWithCustomFieldsQueryOptions } from "@/api/asset.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { AssetDialog } from "@/components/asset-dialog.tsx";
import {
  createAssetTableColumns,
  getAssetCustomFieldColumnId,
} from "@/components/asset-table/columns.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { Button } from "@/components/ui/button.tsx";
import { createUserProfileById, formatUserProfileReference } from "@/components/user-label.tsx";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields/index.ts";
import { useAssetLifecycle } from "@/hooks/use-asset-lifecycle.ts";
import { createAssetListOptions } from "@/hooks/use-asset-table-search-state.ts";
import { capitalizeFirstLetter } from "@/lib/format.ts";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { Asset, AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

export function createAssetTableGroupingOptions(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  userProfileById: Map<string, UserProfile> = new Map(),
): Array<GroupingOption> {
  return [
    {
      id: "type",
      label: "Type",
      formatValue: (value) => capitalizeFirstLetter(String(value)),
    },
    {
      id: "ownerId",
      label: "Owner",
      formatValue: (value) =>
        typeof value === "string"
          ? value
          : formatUserProfileReference(null, userProfileById, {
              emptyLabel: "No Owner",
              unknownLabel: "Unknown Owner",
            }),
    },
    ...customFieldDefinitions.map((definition) => ({
      id: getAssetCustomFieldColumnId(definition.id),
      label: definition.name,
      formatValue: (value: unknown) =>
        typeof value === "string" && value.length > 0 ? value : "None",
    })),
  ];
}

interface AssetTableProps {
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedAssetId?: string;
  onSelectAsset?: (asset: Asset) => void;
}

export function AssetTable({
  filterState,
  onFilterStateChange,
  selectedAssetId,
  onSelectAsset,
}: AssetTableProps = {}) {
  const navigate = useNavigate();
  const assetLifecycle = useAssetLifecycle();
  const assetsQuery = useQuery(
    createListAssetsWithCustomFieldsQueryOptions(createAssetListOptions(filterState)),
  );
  const usersQuery = useQuery(createListUsersQueryOptions());
  const customFieldDefinitionsQuery = useQuery(createListAssetCustomFieldDefinitionsQueryOptions());
  const customFieldDefinitions = useMemo(
    () => customFieldDefinitionsQuery.data ?? [],
    [customFieldDefinitionsQuery.data],
  );
  const userProfileById = useMemo(() => createUserProfileById(usersQuery.data), [usersQuery.data]);
  const tableColumns = useMemo(
    () => createAssetTableColumns(customFieldDefinitions, userProfileById, usersQuery.isPending),
    [customFieldDefinitions, userProfileById, usersQuery.isPending],
  );
  const groupingOptions = useMemo(
    () => createAssetTableGroupingOptions(customFieldDefinitions, userProfileById),
    [customFieldDefinitions, userProfileById],
  );
  const initialColumnVisibility = useMemo(
    () =>
      Object.fromEntries(
        customFieldDefinitions.map((definition) => [
          getAssetCustomFieldColumnId(definition.id),
          false,
        ]),
      ),
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

  const handleDeleteAssets = async (assets: Array<AssetWithCustomFields>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete Assets",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${assets.length} asset(s)?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    await assetLifecycle.deleteAssets(assets);
  };

  const handleCreateAsset = async () => {
    const assetToCreate = await AssetDialog.call({});

    if (assetToCreate) {
      await assetLifecycle.createAsset(assetToCreate);
    }
  };

  function ToolbarElements() {
    return (
      <Button variant="default" size="sm" className="h-9 rounded-xl" onClick={handleCreateAsset}>
        <Plus />
        New asset
      </Button>
    );
  }

  return (
    <DataTable
      columns={tableColumns}
      query={assetsQuery}
      groupingOptions={groupingOptions}
      onRowClick={onSelectAsset}
      onRowDoubleClick={handleOpenAsset}
      isRowActive={(asset) => asset.id === selectedAssetId}
      onRowDelete={handleDeleteAssets}
      toolbarControls={ToolbarElements()}
      initialColumnVisibility={initialColumnVisibility}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
    />
  );
}
