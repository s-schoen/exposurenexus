import { describe, expect, it } from "vitest";

import { createSelectedSearch, validateSelectedSearch } from "@/hooks/use-selected-search-param.ts";

// Selecting and clearing rows through the URL is covered by the feature *.app.test.tsx files.
describe("selected search param", () => {
  it("validates selected search params", () => {
    expect(validateSelectedSearch({ selected: "row-1" })).toEqual({
      selected: "row-1",
    });
    expect(validateSelectedSearch({ selected: 42 })).toEqual({
      selected: undefined,
    });
  });

  it("preserves existing search params when changing the selected row", () => {
    expect(createSelectedSearch("row-2")({ filter: "admin" })).toEqual({
      filter: "admin",
      selected: "row-2",
    });
    expect(createSelectedSearch(undefined)({ filter: "admin", selected: "row-1" })).toEqual({
      filter: "admin",
      selected: undefined,
    });
  });
});
