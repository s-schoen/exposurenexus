import { FindingStatus } from "@exposurenexus/types/model/finding";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFindingTableFilterState,
  createFindingTableSearchParams,
  useFindingTableSearchState,
  validateFindingTableSearch,
} from "@/hooks/use-finding-table-search-state.ts";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

describe("useFindingTableSearchState", () => {
  afterEach(() => {
    cleanup();
    mocks.navigate.mockReset();
  });

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

  it("updates the finding route search state", () => {
    const { result } = renderHook(() =>
      useFindingTableSearchState({
        search: {},
        to: "/findings",
      }),
    );

    act(() => {
      result.current.onFilterStateChange({
        globalFilter: "edge",
        selectFilters: {
          assignee: ["user-1"],
          severity: ["critical"],
          status: ["confirmed"],
        },
      });
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/findings",
      replace: true,
      search: expect.any(Function),
    });

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(search({ filter: "old", selected: "finding-1" })).toEqual({
      assignee: "user-1",
      filter: "edge",
      selected: "finding-1",
      severity: "critical",
      status: "confirmed",
    });
  });

  it("writes the triage default status into the URL when absent", async () => {
    renderHook(() =>
      useFindingTableSearchState({
        search: {},
        to: "/findings/triage",
        defaultStatusFilter: [FindingStatus.Active],
      }),
    );

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/findings/triage",
        replace: true,
        search: expect.any(Function),
      });
    });

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(search({ selected: "finding-1" })).toEqual({
      assignee: undefined,
      filter: undefined,
      selected: "finding-1",
      severity: undefined,
      status: FindingStatus.Active,
    });
  });

  it("uses an existing comma-delimited triage status instead of writing the default", () => {
    const { result } = renderHook(() =>
      useFindingTableSearchState({
        search: { status: "fixed,false-positive" },
        to: "/findings/triage",
        defaultStatusFilter: [FindingStatus.Active],
      }),
    );

    expect(result.current.filterState).toEqual({
      globalFilter: "",
      selectFilters: {
        status: ["fixed", "false-positive"],
      },
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
