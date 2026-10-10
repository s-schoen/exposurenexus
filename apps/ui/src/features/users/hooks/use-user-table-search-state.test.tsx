import { describe, expect, it } from "vitest";

import {
  createUserTableFilterState,
  createUserTableSearchParams,
  validateUserTableSearch,
} from "@/features/users/hooks/use-user-table-search-state.ts";

// Navigation through these helpers is covered by users.app.test.tsx.
describe("user table search state", () => {
  it("validates user table filter search params", () => {
    expect(
      validateUserTableSearch({
        enabled: ["true,false", 42],
        filter: "alice",
      }),
    ).toEqual({
      enabled: "true,false",
      filter: "alice",
    });
  });

  it("creates user table filter state from route search", () => {
    expect(
      createUserTableFilterState({
        enabled: "true,false",
        filter: "alice",
      }),
    ).toEqual({
      globalFilter: "alice",
      selectFilters: {
        enabled: ["true", "false"],
      },
    });
  });

  it("serializes user table filters back to search params", () => {
    expect(
      createUserTableSearchParams({
        globalFilter: "bob",
        selectFilters: {
          enabled: ["false"],
        },
      }),
    ).toEqual({
      enabled: "false",
      filter: "bob",
    });
  });

  it("clears empty user table filters", () => {
    expect(
      createUserTableSearchParams({
        globalFilter: "",
        selectFilters: {},
      }),
    ).toEqual({
      enabled: undefined,
      filter: undefined,
    });
  });
});
