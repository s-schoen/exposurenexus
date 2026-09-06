import { createFileRoute } from "@tanstack/react-router";

import {
  createListVulnerabilitiesQueryOptions,
  VulnerabilitiesPage,
  validateVulnerabilityTableSearch,
} from "@/features/vulnerabilities";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateVulnerabilityTableSearch(search),
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(createListVulnerabilitiesQueryOptions()),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <VulnerabilitiesPage search={search} selected={search.selected} />;
}
