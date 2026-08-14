import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSelectedSearch,
  useSelectedSearchParam,
  validateSelectedSearch,
} from "@/hooks/use-selected-search-param.ts";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

describe("useSelectedSearchParam", () => {
  afterEach(() => {
    cleanup();
    mocks.navigate.mockReset();
  });

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

  it("selects and clears selected rows through route search", () => {
    const { result } = renderHook(() =>
      useSelectedSearchParam({
        selectedId: "row-1",
        to: "/findings",
        replace: true,
        getId: (row: { id: string }) => row.id,
      }),
    );

    expect(result.current.selectedId).toBe("row-1");
    expect(result.current.isRowSelected({ id: "row-1" })).toBe(true);
    expect(result.current.isRowSelected({ id: "row-2" })).toBe(false);

    act(() => {
      void result.current.selectRow({ id: "row-2" });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/findings",
      replace: true,
      search: expect.any(Function),
    });
    expect(mocks.navigate.mock.calls[0][0].search({ filter: "admin" })).toEqual({
      filter: "admin",
      selected: "row-2",
    });

    act(() => {
      void result.current.clearSelected();
    });
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/findings",
      replace: true,
      search: expect.any(Function),
    });
    expect(
      mocks.navigate.mock.calls[1][0].search({
        filter: "admin",
        selected: "row-2",
      }),
    ).toEqual({
      filter: "admin",
      selected: undefined,
    });
  });
});
