import { createFileRoute } from "@tanstack/react-router";

import { AssetsPage } from "@/features/assets/components/assets-page.tsx";
import { validateAssetTableSearch } from "@/hooks/use-asset-table-search-state.ts";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateAssetTableSearch(search),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <AssetsPage search={search} selected={search.selected} />;
}
