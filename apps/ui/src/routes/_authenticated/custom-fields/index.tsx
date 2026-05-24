import { createFileRoute } from "@tanstack/react-router"
import { CustomFieldsRouteComponent } from "@/routes/_authenticated/custom-fields/-index-route-component.tsx"
import { validateCustomFieldTableSearch } from "@/hooks/use-custom-field-table-search-state.ts"
import {
  validateSelectedSearch
} from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/custom-fields/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateCustomFieldTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return (
    <CustomFieldsRouteComponent search={search} selected={search.selected} />
  )
}
