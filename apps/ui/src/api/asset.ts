import {
  assetIdentifierRecordSchema,
  assetSchema,
  assetWithCustomFieldsSchema,
} from "@exposurenexus/contracts/model/asset";
import {
  assetCustomFieldDefinitionSchema,
  assetCustomFieldValueSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
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
  AssetEnvironment,
  AssetIdentifierRecord,
  AssetLifecycleState,
  CreateAsset,
  CreateAssetIdentifier,
  AssetType,
  AssetWithCustomFields,
  UpdateAsset,
  UpdateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
} from "@exposurenexus/contracts/model/asset-custom-field";

export interface AssetListOptions {
  filter?: string;
  assetType?: ReadonlyArray<AssetType>;
  assetEnvironment?: ReadonlyArray<AssetEnvironment>;
  assetLifecycleState?: ReadonlyArray<AssetLifecycleState>;
  assetOwnerId?: ReadonlyArray<string>;
}

function createAssetListQueryString(options?: AssetListOptions): string {
  const params = new URLSearchParams();
  const filter = options?.filter?.trim();

  if (filter) {
    params.set("filter", filter);
  }

  if (options?.assetType && options.assetType.length > 0) {
    params.set("assetType", options.assetType.join(","));
  }

  if (options?.assetEnvironment && options.assetEnvironment.length > 0) {
    params.set("assetEnvironment", options.assetEnvironment.join(","));
  }

  if (options?.assetLifecycleState && options.assetLifecycleState.length > 0) {
    params.set("assetLifecycleState", options.assetLifecycleState.join(","));
  }

  if (options?.assetOwnerId && options.assetOwnerId.length > 0) {
    params.set("assetOwnerId", options.assetOwnerId.join(","));
  }

  return params.toString();
}

function createAssetListUrl(includeCustomFields: boolean, options?: AssetListOptions): string {
  const params = new URLSearchParams();

  if (includeCustomFields) {
    params.set("includeCustomFields", "true");
  }

  const query = createAssetListQueryString(options);
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) {
      params.set(key, value);
    }
  }

  const serialized = params.toString();
  return serialized ? `/api/assets?${serialized}` : "/api/assets";
}

async function listAssets(options?: AssetListOptions): Promise<Array<Asset>> {
  const response = await apiRequest(createAssetListUrl(false, options), {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetSchema);
}

export async function listAssetsWithCustomFields(
  options?: AssetListOptions,
): Promise<Array<AssetWithCustomFields>> {
  const response = await apiRequest(createAssetListUrl(true, options), {
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

export async function createAsset(asset: CreateAsset): Promise<Asset> {
  const response = await apiRequest("/api/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(asset),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

export async function updateAsset(assetId: string, asset: UpdateAsset): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${assetId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(asset),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetSchema);
}

export async function addAssetIdentifier(
  assetId: string,
  identifier: CreateAssetIdentifier,
): Promise<AssetIdentifierRecord> {
  const response = await apiRequest(`/api/assets/${assetId}/identifiers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(identifier),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetIdentifierRecordSchema);
}

export async function updateAssetIdentifier(
  assetId: string,
  identifierId: string,
  identifier: UpdateAssetIdentifier,
): Promise<AssetIdentifierRecord> {
  const response = await apiRequest(`/api/assets/${assetId}/identifiers/${identifierId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(identifier),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetIdentifierRecordSchema);
}

export async function deleteAssetIdentifier(
  assetId: string,
  identifierId: string,
): Promise<AssetIdentifierRecord> {
  const response = await apiRequest(`/api/assets/${assetId}/identifiers/${identifierId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetIdentifierRecordSchema);
}

export function createListAssetsQueryOptions(options?: AssetListOptions) {
  const query = createAssetListQueryString(options);

  return queryOptions({
    queryKey: query ? ["assets", query] : ["assets"],
    queryFn: () => listAssets(options),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createListAssetsWithCustomFieldsQueryOptions(options?: AssetListOptions) {
  const query = createAssetListQueryString(options);

  return queryOptions({
    queryKey: query ? ["assets", "with-custom-fields", query] : ["assets", "with-custom-fields"],
    queryFn: () => listAssetsWithCustomFields(options),
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
