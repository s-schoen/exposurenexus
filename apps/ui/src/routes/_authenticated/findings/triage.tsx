import { createFileRoute } from "@tanstack/react-router";

import { createListAssetsQueryOptions } from "@/features/assets";
import {
  TriageFindingsPage,
  createListFindingsQueryOptions,
  validateFindingTableSearch,
} from "@/features/findings";
import { createListUsersQueryOptions } from "@/features/users";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/findings/triage")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateFindingTableSearch(search),
  }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(createListFindingsQueryOptions()),
      queryClient.ensureQueryData(createListAssetsQueryOptions()),
      queryClient.ensureQueryData(createListUsersQueryOptions()),
    ]),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <TriageFindingsPage search={search} selected={search.selected} />;
}
