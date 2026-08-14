import { createFileRoute } from "@tanstack/react-router";

import { CustomFieldsPage } from "@/features/custom-fields/components/custom-fields-page.tsx";
import { validateCustomFieldTableSearch } from "@/hooks/use-custom-field-table-search-state.ts";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/custom-fields/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateCustomFieldTableSearch(search),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <CustomFieldsPage search={search} selected={search.selected} />;
}
