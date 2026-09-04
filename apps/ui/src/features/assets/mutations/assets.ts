import { useMutation } from "@tanstack/react-query";

import {
  addAssetIdentifier,
  createAsset,
  deleteAsset,
  deleteAssetIdentifier,
  replaceAssetCustomFieldAssociations,
  updateAsset,
  updateAssetCustomFieldValues,
  updateAssetIdentifier,
} from "@/features/assets/api/assets.ts";

import type {
  CreateAsset,
  CreateAssetIdentifier,
  UpdateAsset,
  UpdateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type {
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
} from "@exposurenexus/contracts/model/asset-custom-field";

export function useCreateAssetMutation() {
  return useMutation({
    mutationFn: (asset: CreateAsset) => createAsset(asset),
  });
}

export function useDeleteAssetMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
  });
}

export function useUpdateAssetMutation() {
  return useMutation({
    mutationFn: ({ assetId, asset }: { assetId: string; asset: UpdateAsset }) =>
      updateAsset(assetId, asset),
  });
}

export function useAddAssetIdentifierMutation() {
  return useMutation({
    mutationFn: ({ assetId, identifier }: { assetId: string; identifier: CreateAssetIdentifier }) =>
      addAssetIdentifier(assetId, identifier),
  });
}

export function useUpdateAssetIdentifierMutation() {
  return useMutation({
    mutationFn: ({
      assetId,
      identifierId,
      identifier,
    }: {
      assetId: string;
      identifierId: string;
      identifier: UpdateAssetIdentifier;
    }) => updateAssetIdentifier(assetId, identifierId, identifier),
  });
}

export function useDeleteAssetIdentifierMutation() {
  return useMutation({
    mutationFn: ({ assetId, identifierId }: { assetId: string; identifierId: string }) =>
      deleteAssetIdentifier(assetId, identifierId),
  });
}

export function useUpdateAssetCustomFieldValuesMutation() {
  return useMutation({
    mutationFn: ({
      assetId,
      values,
    }: {
      assetId: string;
      values: UpdateAssetCustomFieldValues["values"];
    }) => updateAssetCustomFieldValues(assetId, values),
  });
}

export function useReplaceAssetCustomFieldAssociationsMutation() {
  return useMutation({
    mutationFn: ({
      assetId,
      fieldIds,
    }: {
      assetId: string;
      fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"];
    }) => replaceAssetCustomFieldAssociations(assetId, fieldIds),
  });
}
