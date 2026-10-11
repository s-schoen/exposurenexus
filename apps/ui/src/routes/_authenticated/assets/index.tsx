import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  AssetsPage,
  createAssetListOptionsFromSearch,
  createListAssetsWithCustomFieldsQueryOptions,
  validateAssetTableSearch,
} from "@/features/assets";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { createFindingStatsQueryOptions } from "@/features/findings";
import { createListUsersQueryOptions } from "@/features/users";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateAssetTableSearch(search),
  }),
  loaderDeps: ({ search }) => {
    const { selected: _selected, group: _group, ...deps } = search;

    return deps;
  },
  loader: async ({ context: { queryClient }, deps }) => {
    const customFieldDefinitions = await queryClient.ensureQueryData(
      createListAssetCustomFieldDefinitionsQueryOptions(),
    );
    const assetListOptions = createAssetListOptionsFromSearch(deps, customFieldDefinitions);

    return Promise.all([
      queryClient.ensureQueryData(createListAssetsWithCustomFieldsQueryOptions(assetListOptions)),
      queryClient.ensureQueryData(createFindingStatsQueryOptions()),
      queryClient.ensureQueryData(createListUsersQueryOptions()),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  // The assets feature doesn't depend on findings, so the route hands it the finding counts.
  const findingStats = useSuspenseQuery(createFindingStatsQueryOptions());

  return (
    <AssetsPage
      search={search}
      selected={search.selected}
      findingCountByAssetId={findingStats.data.assets}
    />
  );
}
