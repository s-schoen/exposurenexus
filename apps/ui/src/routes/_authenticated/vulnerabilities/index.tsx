import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilitiesRouteComponent } from "@/routes/_authenticated/vulnerabilities/-index-route-component.tsx"
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts"
import { validateVulnerabilityTableSearch } from "@/hooks/use-vulnerability-table-search-state.ts"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateVulnerabilityTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return <VulnerabilitiesRouteComponent search={search} selected={search.selected} />
}
