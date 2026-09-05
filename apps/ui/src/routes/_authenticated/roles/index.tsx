import { createFileRoute } from "@tanstack/react-router";

import { RolesPage, validateRoleTableSearch, createListRolesQueryOptions } from "@/features/roles";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/roles/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateRoleTableSearch(search),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(createListRolesQueryOptions()),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <RolesPage search={search} selected={search.selected} />;
}
