import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/api/asset-custom-field.ts"
import { AssetCustomFieldTable } from "@/components/asset-custom-field-table"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/custom-fields/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()
  const customFieldsQuery = useQuery(
    createListAssetCustomFieldDefinitionsQueryOptions()
  )
  const [filter, setFilter] = useQueryState("filter")
  const [typeFilter, setTypeFilter] = useQueryState(
    "type",
    parseAsArrayOf(parseAsString).withDefault([])
  )
  const [requiredFilter, setRequiredFilter] = useQueryState(
    "required",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const filterState = useMemo<DataTableFilterState>(
    () => ({
      globalFilter: filter ?? "",
      selectFilters: {
        ...(typeFilter.length > 0 ? { type: typeFilter } : {}),
        ...(requiredFilter.length > 0 ? { required: requiredFilter } : {})
      }
    }),
    [filter, typeFilter, requiredFilter]
  )

  usePageMeta({
    title: "Custom Fields",
    description: "Manage asset metadata fields."
  })

  const handleFilterStateChange = (nextState: DataTableFilterState) => {
    void setFilter(nextState.globalFilter ? nextState.globalFilter : null)

    const nextTypeFilter = nextState.selectFilters.type ?? []
    void setTypeFilter(nextTypeFilter.length ? nextTypeFilter : null)

    const nextRequiredFilter = nextState.selectFilters.required ?? []
    void setRequiredFilter(
      nextRequiredFilter.length ? nextRequiredFilter : null
    )
  }

  return (
    <AssetCustomFieldTable
      query={customFieldsQuery}
      selectedCustomFieldId={selected}
      filterState={filterState}
      onFilterStateChange={handleFilterStateChange}
      onSelectCustomField={(field) =>
        navigate({
          to: "/custom-fields",
          replace: true,
          search: (prev) => ({
            ...prev,
            selected: field.id
          })
        })
      }
    />
  )
}
