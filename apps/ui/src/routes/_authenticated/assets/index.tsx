import { createFileRoute } from "@tanstack/react-router"
import { AssetsRouteComponent } from "@/routes/_authenticated/assets/-index-route-component.tsx"
import { validateAssetTableSearch } from "@/hooks/use-asset-table-search-state.ts"
import {
  validateSelectedSearch
} from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateAssetTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return <AssetsRouteComponent search={search} selected={search.selected} />
}
