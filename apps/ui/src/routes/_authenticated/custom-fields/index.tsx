import { createFileRoute } from "@tanstack/react-router";

import {
  CustomFieldsPage,
  validateCustomFieldTableSearch,
} from "@/features/custom-fields/index.ts";
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
