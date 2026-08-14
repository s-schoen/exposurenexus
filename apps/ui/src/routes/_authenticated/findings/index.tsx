import { createFileRoute } from "@tanstack/react-router";

import { FindingsPage } from "@/features/findings/components/findings-page.tsx";
import { validateFindingTableSearch } from "@/hooks/use-finding-table-search-state.ts";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/findings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateFindingTableSearch(search),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <FindingsPage search={search} selected={search.selected} />;
}
