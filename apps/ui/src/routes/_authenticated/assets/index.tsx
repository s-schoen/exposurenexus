import { createFileRoute } from "@tanstack/react-router";

import {
  AssetsPage,
  createAssetListOptionsFromSearch,
  createListAssetsWithCustomFieldsQueryOptions,
  validateAssetTableSearch,
} from "@/features/assets";
import { createListAssetCustomFieldDefinitionsQueryOptions } from "@/features/custom-fields";
import { createListUsersQueryOptions } from "@/features/users";
import { validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

export const Route = createFileRoute("/_authenticated/assets/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...validateSelectedSearch(search),
    ...validateAssetTableSearch(search),
  }),
  loaderDeps: ({ search }) => {
    const { selected: _selected, ...deps } = search;

    return deps;
  },
  loader: async ({ context: { queryClient }, deps }) => {
    const customFieldDefinitions = await queryClient.ensureQueryData(
      createListAssetCustomFieldDefinitionsQueryOptions(),
    );
    const assetListOptions = createAssetListOptionsFromSearch(deps, customFieldDefinitions);

    return Promise.all([
      queryClient.ensureQueryData(createListAssetsWithCustomFieldsQueryOptions(assetListOptions)),
      queryClient.ensureQueryData(createListUsersQueryOptions()),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return <AssetsPage search={search} selected={search.selected} />;
}
