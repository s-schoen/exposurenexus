import { describe, expect, it } from "vitest";

import {
  createRoleTableFilterState,
  createRoleTableSearchParams,
  validateRoleTableSearch,
} from "@/features/roles/hooks/use-role-table-search-state.ts";

// Navigation through these helpers is covered by roles.app.test.tsx.
describe("role table search state", () => {
  it("validates role table filter search params", () => {
    expect(
      validateRoleTableSearch({
        filter: "security",
        kind: ["built-in,custom", 42],
      }),
    ).toEqual({
      filter: "security",
      kind: "built-in,custom",
    });
  });

  it("creates role table filter state from route search", () => {
    expect(
      createRoleTableFilterState({
        filter: "security",
        kind: "built-in,custom",
      }),
    ).toEqual({
      globalFilter: "security",
      selectFilters: {
        kind: ["built-in", "custom"],
      },
    });
  });

  it("serializes role table filters back to search params", () => {
    expect(
      createRoleTableSearchParams({
        globalFilter: "security",
        selectFilters: {
          kind: ["custom"],
        },
      }),
    ).toEqual({
      filter: "security",
      kind: "custom",
    });
  });

  it("clears empty role table filters", () => {
    expect(
      createRoleTableSearchParams({
        globalFilter: "",
        selectFilters: {},
      }),
    ).toEqual({
      filter: undefined,
      kind: undefined,
    });
  });
});
