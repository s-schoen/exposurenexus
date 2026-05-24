import { createFileRoute } from "@tanstack/react-router"
import { RoleIndexRouteComponent } from "@/routes/_authenticated/roles/-index-route-component.tsx"
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts"
import { validateRoleTableSearch } from "@/hooks/use-role-table-search-state.ts"

export const Route = createFileRoute("/_authenticated/roles/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateRoleTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return <RoleIndexRouteComponent search={search} selected={search.selected} />
}
