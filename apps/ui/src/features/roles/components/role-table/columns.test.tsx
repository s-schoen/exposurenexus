import { describe, expect, it } from "vitest";

import { columns } from "@/features/roles/components/role-table/columns.tsx";
import { SEED_ROLES } from "@/mocks/fixtures/seed.ts";

describe("role table type filter", () => {
  it.each([
    ["built-in with no selection", SEED_ROLES[0], [], true],
    ["built-in match", SEED_ROLES[0], ["Built-in"], true],
    ["built-in non-match", SEED_ROLES[0], ["Custom"], false],
    ["custom with no selection", SEED_ROLES[3], [], true],
    ["custom match", SEED_ROLES[3], ["Custom"], true],
    ["custom non-match", SEED_ROLES[3], ["Built-in"], false],
  ])("returns the public predicate result for %s", (_case, role, selection, expected) => {
    const kindColumn = columns.find((column) => "id" in column && column.id === "kind");
    const filterFn = kindColumn?.filterFn;

    if (typeof filterFn !== "function") {
      throw new Error("Expected a role kind filter function");
    }

    const row = { original: role };
    expect(filterFn(row as never, "kind", selection, () => undefined)).toBe(expected);
  });
});
