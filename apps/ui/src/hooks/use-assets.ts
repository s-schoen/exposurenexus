import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getAssetByID, listAssets } from "@/api/asset.ts"

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
    placeholderData: keepPreviousData
  })
}

export function useAssetByID(id: string) {
  return useQuery({
    queryKey: ["asset", id],
    queryFn: () => getAssetByID(id)
  })
}
