import { createFileRoute } from "@tanstack/react-router";

import { TriageFindingsPage, validateFindingTableSearch } from "@/features/findings";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/findings/triage")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateFindingTableSearch(search),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <TriageFindingsPage search={search} selected={search.selected} />;
}
