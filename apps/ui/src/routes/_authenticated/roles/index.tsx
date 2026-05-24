import { createFileRoute } from "@tanstack/react-router"
import { RoleIndexRouteComponent } from "@/routes/_authenticated/roles/-index-route-component.tsx"
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/roles/")({
  validateSearch: (search) => ({
    ...search,
    ...validateSelectedSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const { selected } = Route.useSearch()

  return <RoleIndexRouteComponent selected={selected} />
}
