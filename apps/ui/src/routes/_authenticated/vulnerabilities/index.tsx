import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilitiesPage } from "@/features/vulnerabilities/components/vulnerabilities-page.tsx"
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

  return <VulnerabilitiesPage search={search} selected={search.selected} />
}
