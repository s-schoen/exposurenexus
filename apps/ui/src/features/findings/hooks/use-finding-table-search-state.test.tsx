import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it } from "vitest";

import {
  createFindingTableFilterState,
  createFindingTableSearchParams,
  validateFindingTableSearch,
} from "@/features/findings/hooks/use-finding-table-search-state.ts";

// Navigation through these helpers, including the triage default, is covered by
// findings.app.test.tsx.
describe("finding table search state", () => {
  it("validates finding table filter search params", () => {
    expect(
      validateFindingTableSearch({
        assignee: ["user-1,user-2", 42],
        filter: "admin",
        severity: "critical,high",
        status: ["active", "fixed,false-positive"],
      }),
    ).toEqual({
      assignee: "user-1,user-2",
      filter: "admin",
      severity: "critical,high",
      status: "active,fixed,false-positive",
    });
  });

  it("creates finding table filter state from route search", () => {
    expect(
      createFindingTableFilterState({
        assignee: ["user-1"],
        filter: "admin",
        severity: "critical,high",
        status: ["confirmed"],
      }),
    ).toEqual({
      globalFilter: "admin",
      selectFilters: {
        assignee: ["user-1"],
        severity: ["critical", "high"],
        status: ["confirmed"],
      },
    });
  });

  it("uses the explicit default status when status is absent", () => {
    expect(createFindingTableFilterState({}, [FindingStatus.Active])).toEqual({
      globalFilter: "",
      selectFilters: {
        status: [FindingStatus.Active],
      },
    });
  });

  it("serializes finding table filters back to search params", () => {
    expect(
      createFindingTableSearchParams({
        globalFilter: "edge",
        selectFilters: {
          assignee: ["user-1"],
          severity: ["critical"],
          status: ["confirmed"],
        },
      }),
    ).toEqual({
      assignee: "user-1",
      filter: "edge",
      severity: "critical",
      status: "confirmed",
    });
  });
});
