import { createFileRoute } from "@tanstack/react-router"
import { RolesPage } from "@/features/roles/components/roles-page.tsx"
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

  return <RolesPage search={search} selected={search.selected} />
}
