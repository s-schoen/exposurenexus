import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import type { Asset, AssetType } from "@openvlp/types/model/asset"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

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

export async function createAsset(
  name: string,
  type: AssetType
): Promise<Asset> {
  const response = await apiRequest("/api/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      type
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

export function createAssetByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["asset", id],
    queryFn: () => getAssetByID(id)
  })
}
