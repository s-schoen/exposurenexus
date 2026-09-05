import { createFileRoute } from "@tanstack/react-router";

import { createListRolesQueryOptions } from "@/features/roles";
import { UsersPage, createListUsersQueryOptions, validateUserTableSearch } from "@/features/users";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateUserTableSearch(search),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(createListUsersQueryOptions()),
      context.queryClient.ensureQueryData(createListRolesQueryOptions()),
    ]),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <UsersPage search={search} selected={search.selected} />;
}
