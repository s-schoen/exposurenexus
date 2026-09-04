import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  getFindingNavigationCounts,
} from "@/features/findings/queries/findings.ts";
import { VULNERABILITY_INVALIDATION_TAG } from "@/features/vulnerabilities";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("finding queries", () => {
  it("creates list query options with the established cache policy", () => {
    const options = createListFindingsQueryOptions();

    expect(options.queryKey).toEqual(["findings"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
    expect(options.meta).toEqual({ invalidationTags: [VULNERABILITY_INVALIDATION_TAG] });
  });

  it("creates finding detail and observation query options", () => {
    const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";

    expect(createFindingByIDQueryOptions(findingId).queryKey).toEqual(["findings", findingId]);
    expect(createFindingObservationsQueryOptions(findingId).queryKey).toEqual([
      "findings",
      findingId,
      "observations",
    ]);
    expect(createFindingByIDQueryOptions(findingId).placeholderData).toBeUndefined();
    expect(createFindingObservationsQueryOptions(findingId).placeholderData).toBeUndefined();
    expect(createFindingByIDQueryOptions(findingId).meta).toEqual({
      invalidationTags: [VULNERABILITY_INVALIDATION_TAG],
    });
  });

  it("creates stats query options with the established cache policy", () => {
    const options = createFindingStatsQueryOptions();

    expect(options.queryKey).toEqual(["findings", "stats"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("derives zero navigation counts without finding statistics", () => {
    expect(getFindingNavigationCounts(undefined)).toEqual({
      triageCount: 0,
      mitigationCount: 0,
    });
  });

  it("derives navigation counts from active and confirmed findings", () => {
    expect(
      getFindingNavigationCounts({
        total: 3,
        status: {
          [FindingStatus.Active]: 2,
          [FindingStatus.Inactive]: 0,
          [FindingStatus.Confirmed]: 1,
          [FindingStatus.FalsePositive]: 0,
          [FindingStatus.RiskAccepted]: 0,
          [FindingStatus.Duplicate]: 0,
          [FindingStatus.OutOfScope]: 0,
          [FindingStatus.Mitigated]: 0,
        },
        severity: {
          info: 0,
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        assets: {},
      }),
    ).toEqual({
      triageCount: 2,
      mitigationCount: 1,
    });
  });
});
