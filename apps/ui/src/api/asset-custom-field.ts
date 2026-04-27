import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition
} from "@openvlp/types/model/asset"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

export async function listAssetCustomFieldDefinitions(): Promise<
  Array<AssetCustomFieldDefinition>
> {
  const response = await apiRequest("/api/assets/custom-fields", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<AssetCustomFieldDefinition>(response)
}

export async function getAssetCustomFieldDefinitionByID(
  id: string
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<AssetCustomFieldDefinition>(response)
}

export async function createAssetCustomFieldDefinition(
  definition: CreateAssetCustomFieldDefinition
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest("/api/assets/custom-fields", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(definition)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<AssetCustomFieldDefinition>(response)
}

export async function updateAssetCustomFieldDefinition(
  id: string,
  definition: CreateAssetCustomFieldDefinition
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(definition)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<AssetCustomFieldDefinition>(response)
}

export async function deleteAssetCustomFieldDefinition(
  id: string
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<AssetCustomFieldDefinition>(response)
}

export function createListAssetCustomFieldDefinitionsQueryOptions() {
  return queryOptions({
    queryKey: ["asset-custom-fields"],
    queryFn: () => listAssetCustomFieldDefinitions(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  })
}

export function createAssetCustomFieldDefinitionByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["asset-custom-fields", id],
    queryFn: () => getAssetCustomFieldDefinitionByID(id)
  })
}
