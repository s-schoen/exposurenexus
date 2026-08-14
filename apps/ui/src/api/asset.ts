import { assetSchema, assetWithCustomFieldsSchema } from "@exposurenexus/types/model/asset";
import {
  assetCustomFieldDefinitionSchema,
  assetCustomFieldValueSchema,
} from "@exposurenexus/types/model/asset-custom-field";
import { keepPreviousData, queryOptions, useMutation } from "@tanstack/react-query";

import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/api/common.ts";

import type {
  Asset,
  AssetType,
  AssetWithCustomFields,
  UpdateAssetOwner,
} from "@exposurenexus/types/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
} from "@exposurenexus/types/model/asset-custom-field";

async function listAssets(): Promise<Array<Asset>> {
  const response = await apiRequest("/api/assets", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetSchema);
}

export async function listAssetsWithCustomFields(): Promise<Array<AssetWithCustomFields>> {
  const response = await apiRequest("/api/assets?includeCustomFields=true", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetWithCustomFieldsSchema);
}

export async function deleteAsset(id: string): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

async function getAssetByID(id: string): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

export async function listAssetCustomFieldValues(
  assetId: string,
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetCustomFieldValueSchema);
}

export async function listAvailableAssetCustomFieldDefinitions(
  assetId: string,
): Promise<Array<AssetCustomFieldDefinition>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields/available`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetCustomFieldDefinitionSchema);
}

export async function updateAssetCustomFieldValues(
  assetId: string,
  values: UpdateAssetCustomFieldValues["values"],
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetCustomFieldValueSchema);
}

export async function replaceAssetCustomFieldAssociations(
  assetId: string,
  fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"],
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields/associations`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fieldIds }),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetCustomFieldValueSchema);
}

export async function createAsset(
  name: string,
  type: AssetType,
  ownerId: string | null = null,
): Promise<Asset> {
  const response = await apiRequest("/api/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      type,
      ownerId,
    }),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

export async function updateAssetOwner(
  assetId: string,
  ownerId: UpdateAssetOwner["ownerId"],
): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${assetId}/owner`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ownerId,
    }),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

export function createListAssetsQueryOptions() {
  return queryOptions({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createListAssetsWithCustomFieldsQueryOptions() {
  return queryOptions({
    queryKey: ["assets", "with-custom-fields"],
    queryFn: () => listAssetsWithCustomFields(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createAssetByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["assets", id],
    queryFn: () => getAssetByID(id),
  });
}

export function createAssetCustomFieldValuesQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields"],
    queryFn: () => listAssetCustomFieldValues(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields", "available"],
    queryFn: () => listAvailableAssetCustomFieldDefinitions(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function useCreateAssetMutation() {
  return useMutation({
    mutationFn: ({
      name,
      type,
      ownerId = null,
    }: {
      name: string;
      type: AssetType;
      ownerId?: string | null;
    }) => createAsset(name, type, ownerId),
  });
}

export function useDeleteAssetMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
  });
}

export function useUpdateAssetOwnerMutation() {
  return useMutation({
    mutationFn: ({ assetId, ownerId }: { assetId: string; ownerId: UpdateAssetOwner["ownerId"] }) =>
      updateAssetOwner(assetId, ownerId),
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
