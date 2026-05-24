import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createRoleTableFilterState,
  createRoleTableSearchParams,
  useRoleTableSearchState,
  validateRoleTableSearch
} from "@/hooks/use-role-table-search-state.ts"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn()
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

describe("useRoleTableSearchState", () => {
  afterEach(() => {
    cleanup()
    mocks.navigate.mockReset()
  })

  it("validates role table filter search params", () => {
    expect(
      validateRoleTableSearch({
        filter: "security",
        kind: ["built-in,custom", 42]
      })
    ).toEqual({
      filter: "security",
      kind: "built-in,custom"
    })
  })

  it("creates role table filter state from route search", () => {
    expect(
      createRoleTableFilterState({
        filter: "security",
        kind: "built-in,custom"
      })
    ).toEqual({
      globalFilter: "security",
      selectFilters: {
        kind: ["built-in", "custom"]
      }
    })
  })

  it("serializes role table filters back to search params", () => {
    expect(
      createRoleTableSearchParams({
        globalFilter: "security",
        selectFilters: {
          kind: ["custom"]
        }
      })
    ).toEqual({
      filter: "security",
      kind: "custom"
    })
  })

  it("updates the role route search state and preserves unrelated params", () => {
    const { result } = renderHook(() =>
      useRoleTableSearchState({
        search: {}
      })
    )

    act(() => {
      result.current.onFilterStateChange({
        globalFilter: "security",
        selectFilters: {
          kind: ["custom"]
        }
      })
    })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles",
      replace: true,
      search: expect.any(Function)
    })

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(search({ page: "2", selected: "role-1" })).toEqual({
      filter: "security",
      kind: "custom",
      page: "2",
      selected: "role-1"
    })
  })

  it("clears empty role table filters", () => {
    expect(
      createRoleTableSearchParams({
        globalFilter: "",
        selectFilters: {}
      })
    ).toEqual({
      filter: undefined,
      kind: undefined
    })
  })
})
