import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
  useCreateAssetMutation,
  useDeleteAssetMutation,
  useReplaceAssetCustomFieldAssociationsMutation,
  useUpdateAssetCustomFieldValuesMutation,
  useUpdateAssetOwnerMutation,
} from "@/api/asset.ts";
import { toastActionError } from "@/lib/action-error-toast.ts";

import type { Asset, CreateAsset, UpdateAssetOwner } from "@exposurenexus/types/model/asset";
import type {
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
} from "@exposurenexus/types/model/asset-custom-field";

export interface AssetLifecycleFailure {
  asset: Asset;
  error: unknown;
}

export interface AssetLifecycleBatchResult {
  successful: Array<Asset>;
  failed: Array<AssetLifecycleFailure>;
}

export interface AssetLifecycleActions {
  createAsset: (value: CreateAsset) => Promise<Asset | null>;
  deleteAssets: (assets: Array<Asset>) => Promise<AssetLifecycleBatchResult>;
  updateAssetOwner: (
    assetId: string,
    ownerId: UpdateAssetOwner["ownerId"],
  ) => Promise<Asset | null>;
  updateAssetCustomFieldValues: (
    assetId: string,
    values: UpdateAssetCustomFieldValues["values"],
  ) => Promise<Array<AssetCustomFieldValue> | null>;
  resetAssetCustomFieldValues: (
    assetId: string,
    values: UpdateAssetCustomFieldValues["values"],
  ) => Promise<Array<AssetCustomFieldValue> | null>;
  assignAssetCustomField: (
    assetId: string,
    fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"],
  ) => Promise<Array<AssetCustomFieldValue> | null>;
  detachAssetCustomField: (
    assetId: string,
    fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"],
  ) => Promise<Array<AssetCustomFieldValue> | null>;
}

const listQueryKey = createListAssetsQueryOptions().queryKey;
const listWithCustomFieldsQueryKey = createListAssetsWithCustomFieldsQueryOptions().queryKey;

function detailQueryKey(assetId: string) {
  return createAssetByIDQueryOptions(assetId).queryKey;
}

function customFieldValuesQueryKey(assetId: string) {
  return createAssetCustomFieldValuesQueryOptions(assetId).queryKey;
}

function availableCustomFieldDefinitionsQueryKey(assetId: string) {
  return createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId).queryKey;
}

function formatAssetCount(count: number) {
  return `${count} asset${count === 1 ? "" : "s"}`;
}

function createBatchResult(
  assets: Array<Asset>,
  results: Array<PromiseSettledResult<Asset>>,
): AssetLifecycleBatchResult {
  return results.reduce<AssetLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value);
      } else {
        result.failed.push({
          asset: assets[index],
          error: settled.reason,
        });
      }

      return result;
    },
    {
      successful: [],
      failed: [],
    },
  );
}

function toastDeleteSummary(result: AssetLifecycleBatchResult) {
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`Deleted ${formatAssetCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to delete ${formatAssetCount(total)}`);
    return;
  }

  toast.error(
    `Deleted ${formatAssetCount(result.successful.length)}; failed ${formatAssetCount(result.failed.length)}`,
  );
}

export function useAssetLifecycle(): AssetLifecycleActions {
  const queryClient = useQueryClient();
  const assetCreate = useCreateAssetMutation();
  const assetDelete = useDeleteAssetMutation();
  const ownerUpdate = useUpdateAssetOwnerMutation();
  const customFieldValuesUpdate = useUpdateAssetCustomFieldValuesMutation();
  const customFieldAssociationsReplace = useReplaceAssetCustomFieldAssociationsMutation();

  async function invalidateAssetReads(assetIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: listWithCustomFieldsQueryKey,
        exact: true,
      }),
      ...assetIds.map((assetId) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(assetId),
          exact: true,
        }),
      ),
    ]);
  }

  async function invalidateCustomFieldValues(assetId: string) {
    await queryClient.invalidateQueries({
      queryKey: customFieldValuesQueryKey(assetId),
      exact: true,
    });
  }

  async function invalidateCustomFieldAssociations(assetId: string) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: customFieldValuesQueryKey(assetId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: availableCustomFieldDefinitionsQueryKey(assetId),
        exact: true,
      }),
    ]);
  }

  async function replaceCustomFieldAssociations(
    assetId: string,
    fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"],
    failureMessage: string,
  ) {
    try {
      const updatedValues = await customFieldAssociationsReplace.mutateAsync({
        assetId,
        fieldIds,
      });

      queryClient.setQueryData(customFieldValuesQueryKey(assetId), updatedValues);
      await invalidateCustomFieldAssociations(assetId);

      return updatedValues;
    } catch (error) {
      toastActionError(error, failureMessage);
      console.error(error);
      return null;
    }
  }

  async function updateCustomFieldValues(
    assetId: string,
    values: UpdateAssetCustomFieldValues["values"],
    failureMessage: string,
  ) {
    try {
      const updatedValues = await customFieldValuesUpdate.mutateAsync({
        assetId,
        values,
      });

      queryClient.setQueryData(customFieldValuesQueryKey(assetId), updatedValues);
      await invalidateCustomFieldValues(assetId);

      return updatedValues;
    } catch (error) {
      toastActionError(error, failureMessage);
      console.error(error);
      return null;
    }
  }

  return {
    async createAsset(value) {
      try {
        const createdAsset = await assetCreate.mutateAsync(value);

        toast.success(`Created new asset ${createdAsset.name}`);
        await invalidateAssetReads([createdAsset.id]);

        return createdAsset;
      } catch (error) {
        toastActionError(error, `Failed to create asset: ${error}`);
        console.error(error);
        return null;
      }
    },

    async deleteAssets(assets) {
      if (assets.length === 0) {
        return {
          successful: [],
          failed: [],
        };
      }

      const result = createBatchResult(
        assets,
        await Promise.allSettled(assets.map((asset) => assetDelete.mutateAsync(asset.id))),
      );

      for (const failure of result.failed) {
        console.error(failure.error);
      }

      await invalidateAssetReads(assets.map((asset) => asset.id));
      toastDeleteSummary(result);

      return result;
    },

    async updateAssetOwner(assetId, ownerId) {
      try {
        const updatedAsset = await ownerUpdate.mutateAsync({ assetId, ownerId });

        queryClient.setQueryData(detailQueryKey(assetId), updatedAsset);
        await invalidateAssetReads([assetId]);

        return updatedAsset;
      } catch (error) {
        toastActionError(error, "Failed to update asset owner");
        console.error(error);
        return null;
      }
    },

    updateAssetCustomFieldValues(assetId, values) {
      return updateCustomFieldValues(assetId, values, "Failed to update asset custom field");
    },

    resetAssetCustomFieldValues(assetId, values) {
      return updateCustomFieldValues(assetId, values, "Failed to reset asset custom field");
    },

    assignAssetCustomField(assetId, fieldIds) {
      return replaceCustomFieldAssociations(
        assetId,
        fieldIds,
        "Failed to assign asset custom field",
      );
    },

    detachAssetCustomField(assetId, fieldIds) {
      return replaceCustomFieldAssociations(
        assetId,
        fieldIds,
        "Failed to detach asset custom field",
      );
    },
  };
}
