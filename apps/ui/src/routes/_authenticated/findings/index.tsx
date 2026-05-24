import { createFileRoute } from "@tanstack/react-router"
import { FindingsRouteComponent } from "@/routes/_authenticated/findings/-index-route-component.tsx"
import { validateFindingTableSearch } from "@/hooks/use-finding-table-search-state.ts"
import {
  validateSelectedSearch
} from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/findings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateFindingTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return <FindingsRouteComponent search={search} selected={search.selected} />
}
