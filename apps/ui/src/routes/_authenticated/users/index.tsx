import { createFileRoute } from "@tanstack/react-router"
import { UsersPage } from "@/features/users/components/users-page.tsx"
import {
  validateSelectedSearch
} from "@/hooks/use-selected-search-param.ts"
import { validateUserTableSearch } from "@/hooks/use-user-table-search-state.ts"

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateUserTableSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const search = Route.useSearch()

  return <UsersPage search={search} selected={search.selected} />
}
