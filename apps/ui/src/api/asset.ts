import type { Asset } from "@openvlp/types/model/asset"
import { env } from "@/env.ts"
import {
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

export async function listAssets(): Promise<Asset[]> {
  const response = await fetch(`${env.VITE_API_URL}/api/assets`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<Asset>(response)
}

export async function deleteAsset(id: string): Promise<Asset> {
  const response = await fetch(`${env.VITE_API_URL}/api/assets/${id}`, {
    method: "DELETE",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}

export async function getAssetByID(id: string) {
  const response = await fetch(`${env.VITE_API_URL}/api/assets/${id}`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Asset>(response)
}
