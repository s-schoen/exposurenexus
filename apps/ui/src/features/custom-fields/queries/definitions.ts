import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getAssetCustomFieldDefinitionByID,
  listAssetCustomFieldDefinitions,
} from "@/features/custom-fields/api/definitions.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

export function createListAssetCustomFieldDefinitionsQueryOptions() {
  return queryOptions({
    queryKey: ["asset-custom-fields"],
    queryFn: () => listAssetCustomFieldDefinitions(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createAssetCustomFieldDefinitionByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["asset-custom-fields", id],
    queryFn: () => getAssetCustomFieldDefinitionByID(id),
  });
}
