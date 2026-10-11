import { describe, expect, it } from "vitest";

import {
  createGroupingSearchParam,
  createSearchParamArray,
  getSearchParamArray,
  getSearchParamArrayOrUndefined,
  resolveGroupingSearchParam,
} from "@/components/data-table/search-state.ts";

describe("data table search state list filters", () => {
  it("parses comma-delimited search strings", () => {
    expect(getSearchParamArray("critical,high")).toEqual(["critical", "high"]);
  });

  it("flattens comma-delimited entries inside parsed arrays", () => {
    expect(getSearchParamArray(["critical,high", 42, "medium"])).toEqual([
      "critical",
      "high",
      "medium",
    ]);
  });

  it("returns undefined when no list values are present", () => {
    expect(getSearchParamArrayOrUndefined("")).toBeUndefined();
    expect(getSearchParamArrayOrUndefined([])).toBeUndefined();
  });

  it("serializes list filters as comma-delimited strings", () => {
    expect(createSearchParamArray(["critical", "high"])).toBe("critical,high");
    expect(createSearchParamArray([])).toBeUndefined();
    expect(createSearchParamArray(undefined)).toBeUndefined();
  });
});

describe("data table search state grouping", () => {
  it("resolves the grouping from the URL, falling back to the default", () => {
    expect(resolveGroupingSearchParam(undefined)).toBeUndefined();
    expect(resolveGroupingSearchParam(undefined, "assetId")).toBe("assetId");
    expect(resolveGroupingSearchParam("status", "assetId")).toBe("status");
    expect(resolveGroupingSearchParam("none", "assetId")).toBeUndefined();
  });

  it("keeps the default grouping out of the URL", () => {
    expect(createGroupingSearchParam("assetId", "assetId")).toBeUndefined();
    expect(createGroupingSearchParam("status", "assetId")).toBe("status");
    expect(createGroupingSearchParam(undefined, "assetId")).toBe("none");
    expect(createGroupingSearchParam(undefined)).toBeUndefined();
  });
});
