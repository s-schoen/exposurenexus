import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  createAssetListQueryString,
  getAssetByID,
  listAssetCustomFieldValues,
  listAssets,
  listAssetsWithCustomFields,
  listAvailableAssetCustomFieldDefinitions,
} from "@/features/assets/api/assets.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

import type { AssetListOptions } from "@/features/assets/api/assets.ts";

export function createListAssetsQueryOptions(options?: AssetListOptions) {
  const query = createAssetListQueryString(options);

  return queryOptions({
    queryKey: query ? ["assets", query] : ["assets"],
    queryFn: () => listAssets(options),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createListAssetsWithCustomFieldsQueryOptions(options?: AssetListOptions) {
  const query = createAssetListQueryString(options);

  return queryOptions({
    queryKey: query ? ["assets", "with-custom-fields", query] : ["assets", "with-custom-fields"],
    queryFn: () => listAssetsWithCustomFields(options),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createAssetByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["assets", id],
    queryFn: () => getAssetByID(id),
  });
}

export function createAssetCustomFieldValuesQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields"],
    queryFn: () => listAssetCustomFieldValues(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId: string) {
  return queryOptions({
    queryKey: ["assets", assetId, "custom-fields", "available"],
    queryFn: () => listAvailableAssetCustomFieldDefinitions(assetId),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}
