import { describe, expect, it } from "vitest";

import { EMPTY_FILTER_STATE, isSameFilterState } from "@/components/data-table/filter-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";

function filters(overrides: Partial<DataTableFilterState>): DataTableFilterState {
  return { ...EMPTY_FILTER_STATE, ...overrides };
}

describe("isSameFilterState", () => {
  it("ignores empty filters and the order of filters and values", () => {
    expect(
      isSameFilterState(
        filters({ selectFilters: { status: ["a", "b"], severity: ["high"], assignee: [] } }),
        filters({
          selectFilters: { severity: ["high"], status: ["b", "a"] },
          textFilters: { x: " " },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a different value", filters({ selectFilters: { status: ["b"] } })],
    ["an extra filter", filters({ selectFilters: { status: ["a"], severity: ["high"] } })],
    ["a search", filters({ globalFilter: "web", selectFilters: { status: ["a"] } })],
    ["no filters", EMPTY_FILTER_STATE],
  ])("tells %s apart", (_, other) => {
    expect(isSameFilterState(filters({ selectFilters: { status: ["a"] } }), other)).toBe(false);
  });
});
