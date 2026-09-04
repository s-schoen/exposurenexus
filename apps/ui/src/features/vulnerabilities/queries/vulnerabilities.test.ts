import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  VULNERABILITY_INVALIDATION_TAG,
  createListVulnerabilitiesQueryOptions,
  createVulnerabilityByIDQueryOptions,
} from "@/features/vulnerabilities/queries/vulnerabilities.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("vulnerability queries", () => {
  it("creates list query options with the established cache policy", () => {
    const options = createListVulnerabilitiesQueryOptions();

    expect(options.queryKey).toEqual(["vulnerabilities"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates vulnerability detail query options", () => {
    const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";

    expect(createVulnerabilityByIDQueryOptions(vulnerabilityId).queryKey).toEqual([
      "vulnerabilities",
      vulnerabilityId,
    ]);
  });

  it("exposes the vulnerability invalidation tag", () => {
    expect(VULNERABILITY_INVALIDATION_TAG).toBe("vulnerability");
  });
});
