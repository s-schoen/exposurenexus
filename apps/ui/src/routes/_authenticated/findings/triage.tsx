import { createFileRoute } from "@tanstack/react-router";

import { TriageFindingsPage } from "@/features/findings/components/triage-findings-page.tsx";
import { validateFindingTableSearch } from "@/hooks/use-finding-table-search-state.ts";
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
