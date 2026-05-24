import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { FileRouteTypes } from "@/routeTree.gen.ts"

type AppRouteTo = FileRouteTypes["to"]

export function validateSelectedSearch(search: Record<string, unknown>) {
  return {
    selected: typeof search.selected === "string" ? search.selected : undefined
  }
}

export function createSelectedSearch(selected: string | undefined) {
  return (prev: Record<string, unknown>) => ({
    ...prev,
    selected
  })
}

export function useSelectedSearchParam<
  TItem,
  TTo extends AppRouteTo = AppRouteTo
>({
  getId,
  replace,
  selectedId,
  to
}: {
  getId: (item: TItem) => string
  replace?: boolean
  selectedId?: string
  to: TTo
}) {
  const navigate = useNavigate()
  const navigateSelected = useCallback(
    (selected: string | undefined) => {
      // This helper accepts any generated route target. TanStack cannot prove
      // every target has a compatible `selected` search schema, but callers use
      // it only on list routes that validate this shared param.
      return navigate({
        to,
        ...(typeof replace === "boolean" ? { replace } : {}),
        search: createSelectedSearch(selected)
      } as never)
    },
    [navigate, replace, to]
  )

  return {
    selectedId,
    selectRow: (item: TItem) => navigateSelected(getId(item)),
    clearSelected: () => navigateSelected(undefined),
    isRowSelected: (item: TItem) => getId(item) === selectedId
  }
}
