import {
  keepPreviousData,
  queryOptions,
  useMutation
} from "@tanstack/react-query"
import { assetCustomFieldDefinitionSchema } from "@exposurenexus/types/model/asset-custom-field"
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition
} from "@exposurenexus/types/model/asset-custom-field"
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

  return parseArrayReply(response, assetCustomFieldDefinitionSchema)
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

  return parseObjectReply(response, assetCustomFieldDefinitionSchema)
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

  return parseObjectReply(response, assetCustomFieldDefinitionSchema)
}

export async function updateAssetCustomFieldDefinition(
  id: string,
  definition: UpdateAssetCustomFieldDefinition
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

  return parseObjectReply(response, assetCustomFieldDefinitionSchema)
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

  return parseObjectReply(response, assetCustomFieldDefinitionSchema)
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

export function useCreateAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: (definition: CreateAssetCustomFieldDefinition) =>
      createAssetCustomFieldDefinition(definition)
  })
}

export function useUpdateAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: ({
      id,
      definition
    }: {
      id: string
      definition: UpdateAssetCustomFieldDefinition
    }) => updateAssetCustomFieldDefinition(id, definition)
  })
}

export function useDeleteAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteAssetCustomFieldDefinition(id)
  })
}
