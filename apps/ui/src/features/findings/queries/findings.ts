import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getFindingByID,
  getFindingStats,
  listFindingObservations,
  listFindings,
} from "@/features/findings/api/findings.ts";
import { VULNERABILITY_INVALIDATION_TAG } from "@/features/vulnerabilities";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

import type { FindingStatistics } from "@exposurenexus/contracts/model/finding";

export function createListFindingsQueryOptions() {
  return {
    ...queryOptions({
      queryKey: ["findings"],
      queryFn: () => listFindings(),
      placeholderData: keepPreviousData,
      staleTime: DEFAULT_QUERY_STALE_TIME,
      meta: { invalidationTags: [VULNERABILITY_INVALIDATION_TAG] },
    }),
    queryKey: ["findings"],
  };
}

export function createFindingByIDQueryOptions(id: string) {
  return {
    ...queryOptions({
      queryKey: ["findings", id],
      queryFn: () => getFindingByID(id),
      meta: { invalidationTags: [VULNERABILITY_INVALIDATION_TAG] },
    }),
    queryKey: ["findings", id],
  };
}

export function createFindingStatsQueryOptions() {
  return queryOptions({
    queryKey: ["findings", "stats"],
    queryFn: () => getFindingStats(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createFindingObservationsQueryOptions(findingId: string) {
  return queryOptions({
    queryKey: ["findings", findingId, "observations"],
    queryFn: () => listFindingObservations(findingId),
  });
}

export function getFindingNavigationCounts(stats: FindingStatistics | undefined) {
  return {
    triageCount: stats?.status[FindingStatus.Active] ?? 0,
    mitigationCount: stats?.status[FindingStatus.Confirmed] ?? 0,
  };
}
