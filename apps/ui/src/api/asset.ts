import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import type {
  Asset,
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  AssetType,
  AssetWithCustomFields,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues,
  UpdateAssetOwner
} from "@openvlp/types/model/asset"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

interface ClearAssetCustomFieldValueResult {
  cleared: boolean
}

interface DetachAssetCustomFieldResult {
  detached: boolean
}

async function listAssets(): Promise<Array<Asset>> {
  const response = await apiRequest("/api/assets", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<Asset>(response)
}

export async function listAssetsWithCustomFields(): Promise<
  Array<AssetWithCustomFields>
> {
  const response = await apiRequest("/api/assets?includeCustomFields=true", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetWithCustomFields>(response)
}

export async function deleteAsset(id: string): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${id}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}

async function getAssetByID(id: string): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${id}`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}

export async function listAssetCustomFieldValues(
  assetId: string
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetCustomFieldValue>(response)
}

export async function listAvailableAssetCustomFieldDefinitions(
  assetId: string
): Promise<Array<AssetCustomFieldDefinition>> {
  const response = await apiRequest(
    `/api/assets/${assetId}/custom-fields/available`,
    {
      method: "GET"
    }
  )

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetCustomFieldDefinition>(response)
}

export async function updateAssetCustomFieldValues(
  assetId: string,
  values: UpdateAssetCustomFieldValues["values"]
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(`/api/assets/${assetId}/custom-fields`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetCustomFieldValue>(response)
}

export async function assignAssetCustomFields(
  assetId: string,
  fieldIds: UpdateAssetCustomFieldAssociations["fieldIds"]
): Promise<Array<AssetCustomFieldValue>> {
  const response = await apiRequest(
    `/api/assets/${assetId}/custom-fields/associations`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fieldIds })
    }
  )

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetCustomFieldValue>(response)
}

export async function clearAssetCustomFieldValue(
  assetId: string,
  fieldId: string
): Promise<ClearAssetCustomFieldValueResult> {
  const response = await apiRequest(
    `/api/assets/${assetId}/custom-fields/${fieldId}`,
    {
      method: "DELETE"
    }
  )

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<ClearAssetCustomFieldValueResult>(response)
}

export async function detachAssetCustomField(
  assetId: string,
  fieldId: string
): Promise<DetachAssetCustomFieldResult> {
  const response = await apiRequest(
    `/api/assets/${assetId}/custom-fields/associations/${fieldId}`,
    {
      method: "DELETE"
    }
  )

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<DetachAssetCustomFieldResult>(response)
}

export async function createAsset(
  name: string,
  type: AssetType,
  ownerId: string | null = null
): Promise<Asset> {
  const response = await apiRequest("/api/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      type,
      ownerId
    })
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}

export async function updateAssetOwner(
  assetId: string,
  ownerId: UpdateAssetOwner["ownerId"]
): Promise<Asset> {
  const response = await apiRequest(`/api/assets/${assetId}/owner`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ownerId
    })
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}

export function createListAssetsQueryOptions() {
  return queryOptions({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}

export function createListAssetsWithCustomFieldsQueryOptions() {
  return queryOptions({
    queryKey: ["assets", "with-custom-fields"],
    queryFn: () => listAssetsWithCustomFields(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}

export function createAssetByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["asset", id],
    queryFn: () => getAssetByID(id)
  })
}

export function createAssetCustomFieldValuesQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields"],
    queryFn: () => listAssetCustomFieldValues(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}

export function createAvailableAssetCustomFieldDefinitionsQueryOptions(
  assetId: string
) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields", "available"],
    queryFn: () => listAvailableAssetCustomFieldDefinitions(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}
