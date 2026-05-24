import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilitiesRouteComponent } from "@/routes/_authenticated/vulnerabilities/-index-route-component.tsx"
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search) => ({
    ...search,
    ...validateSelectedSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const { selected } = Route.useSearch()

  return <VulnerabilitiesRouteComponent selected={selected} />
}
