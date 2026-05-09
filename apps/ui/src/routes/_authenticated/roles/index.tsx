import { createFileRoute } from "@tanstack/react-router"
import { RoleIndexRouteComponent } from "@/routes/_authenticated/roles/-index-route-component.tsx"

export const Route = createFileRoute("/_authenticated/roles/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const { selected } = Route.useSearch()

  return <RoleIndexRouteComponent selected={selected} />
}
