import { describe, expect, it } from "vitest";

import {
  createCustomFieldTableFilterState,
  createCustomFieldTableSearchParams,
  validateCustomFieldTableSearch,
} from "@/features/custom-fields/hooks/use-custom-field-table-search-state.ts";

// Navigation through these helpers is covered by custom-fields.app.test.tsx.
describe("custom field table search state", () => {
  it("validates custom field table filter search params", () => {
    expect(
      validateCustomFieldTableSearch({
        filter: "environment",
        required: ["true,false", 42],
        type: "text,select",
      }),
    ).toEqual({
      filter: "environment",
      required: "true,false",
      type: "text,select",
    });
  });

  it("creates custom field table filter state from route search", () => {
    expect(
      createCustomFieldTableFilterState({
        filter: "environment",
        required: "true,false",
        type: "text,select",
      }),
    ).toEqual({
      globalFilter: "environment",
      selectFilters: {
        required: ["true", "false"],
        type: ["text", "select"],
      },
    });
  });

  it("serializes custom field table filters back to search params", () => {
    expect(
      createCustomFieldTableSearchParams({
        globalFilter: "environment",
        selectFilters: {
          required: ["true"],
          type: ["select"],
        },
      }),
    ).toEqual({
      filter: "environment",
      required: "true",
      type: "select",
    });
  });

  it("clears empty custom field table filters", () => {
    expect(
      createCustomFieldTableSearchParams({
        globalFilter: "",
        selectFilters: {},
      }),
    ).toEqual({
      filter: undefined,
      required: undefined,
      type: undefined,
    });
  });
});
