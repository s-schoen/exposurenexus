import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getVulnerabilityByID,
  listVulnerabilities,
} from "@/features/vulnerabilities/api/vulnerabilities.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

export const VULNERABILITY_INVALIDATION_TAG = "vulnerability";

export function createListVulnerabilitiesQueryOptions() {
  return queryOptions({
    queryKey: ["vulnerabilities"],
    queryFn: () => listVulnerabilities(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createVulnerabilityByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["vulnerabilities", id],
    queryFn: () => getVulnerabilityByID(id),
  });
}
