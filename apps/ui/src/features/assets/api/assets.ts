import {
  assetIdentifierRecordSchema,
  assetSchema,
  assetWithCustomFieldsSchema,
} from "@exposurenexus/contracts/model/asset";
import {
  assetCustomFieldDefinitionSchema,
  assetCustomFieldValueSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

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

export function createAssetListQueryString(options?: AssetListOptions): string {
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

export async function listAssets(options?: AssetListOptions): Promise<Array<Asset>> {
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

export async function getAssetByID(id: string): Promise<Asset> {
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
