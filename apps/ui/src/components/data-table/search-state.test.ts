import { describe, expect, it } from "vitest";

import {
  createSearchParamArray,
  getSearchParamArray,
  getSearchParamArrayOrUndefined,
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
