import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { listAssets } from "@/api/asset.ts"

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
    placeholderData: keepPreviousData
  })
}
