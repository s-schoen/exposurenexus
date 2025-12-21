import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getFindingByID, listFindings } from "@/api/finding.ts"

export function useFindings() {
  return useQuery({
    queryKey: ["findings"],
    queryFn: () => listFindings(),
    placeholderData: keepPreviousData
  })
}

export function useFindingByID(id: string) {
  return useQuery({
    queryKey: ["finding", id],
    queryFn: () => getFindingByID(id)
  })
}
