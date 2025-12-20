import type { Asset } from "@openvlp/types/model/asset"
import { env } from "@/env.ts"
import { parseArrayReply, parseErrorReply } from "@/api/common.ts"

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
