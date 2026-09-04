import { createFileRoute } from "@tanstack/react-router";

import { VulnerabilitiesPage, validateVulnerabilityTableSearch } from "@/features/vulnerabilities";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateVulnerabilityTableSearch(search),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <VulnerabilitiesPage search={search} selected={search.selected} />;
}
