import type { DataTableFilterState } from "@/components/data-table/types.ts"

export function getSearchParamString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(",")
  }

  return undefined
}

function getSearchParamArrayValues(value: string): Array<string> {
  return value.split(",").filter(Boolean)
}

export function getSearchParamArray(value: unknown): Array<string> {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" ? getSearchParamArrayValues(item) : []
    )
  }

  return typeof value === "string" && value.length > 0
    ? getSearchParamArrayValues(value)
    : []
}

export function getSearchParamArrayOrUndefined(
  value: unknown
): Array<string> | undefined {
  const values = getSearchParamArray(value)

  return values.length > 0 ? values : undefined
}

export function createSearchParamString(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

export function createSearchParamArray(
  value: Array<string> | undefined
): string | undefined {
  return value && value.length > 0 ? value.join(",") : undefined
}

export function getFilterValue(
  filters: Partial<Record<string, string>> | undefined,
  columnId: string
) {
  const value = filters?.[columnId]

  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function createActiveSelectFilters(
  filters: Partial<Record<string, Array<string>>>
): Partial<Record<string, Array<string>>> {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, values]) => Array.isArray(values) && values.length > 0
    )
  )
}

function createActiveScalarFilters(
  filters: Partial<Record<string, string>> | undefined
): Partial<Record<string, string>> | undefined {
  if (!filters) {
    return undefined
  }

  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0
    )
  )

  return Object.keys(activeFilters).length > 0 ? activeFilters : undefined
}

export function createDataTableFilterState({
  globalFilter,
  selectFilters,
  textFilters,
  numberFilters
}: {
  globalFilter?: string
  selectFilters?: Partial<Record<string, Array<string>>>
  textFilters?: Partial<Record<string, string>>
  numberFilters?: Partial<Record<string, string>>
}): DataTableFilterState {
  const filterState: DataTableFilterState = {
    globalFilter: globalFilter ?? "",
    selectFilters: createActiveSelectFilters(selectFilters ?? {})
  }
  const activeTextFilters = createActiveScalarFilters(textFilters)
  const activeNumberFilters = createActiveScalarFilters(numberFilters)

  if (activeTextFilters) {
    filterState.textFilters = activeTextFilters
  }

  if (activeNumberFilters) {
    filterState.numberFilters = activeNumberFilters
  }

  return filterState
}
