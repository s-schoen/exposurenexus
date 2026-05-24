import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createUserTableFilterState,
  createUserTableSearchParams,
  useUserTableSearchState,
  validateUserTableSearch
} from "@/hooks/use-user-table-search-state.ts"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn()
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

describe("useUserTableSearchState", () => {
  afterEach(() => {
    cleanup()
    mocks.navigate.mockReset()
  })

  it("validates user table filter search params", () => {
    expect(
      validateUserTableSearch({
        enabled: ["true,false", 42],
        filter: "alice"
      })
    ).toEqual({
      enabled: "true,false",
      filter: "alice"
    })
  })

  it("creates user table filter state from route search", () => {
    expect(
      createUserTableFilterState({
        enabled: "true,false",
        filter: "alice"
      })
    ).toEqual({
      globalFilter: "alice",
      selectFilters: {
        enabled: ["true", "false"]
      }
    })
  })

  it("serializes user table filters back to search params", () => {
    expect(
      createUserTableSearchParams({
        globalFilter: "bob",
        selectFilters: {
          enabled: ["false"]
        }
      })
    ).toEqual({
      enabled: "false",
      filter: "bob"
    })
  })

  it("updates the user route search state and preserves unrelated params", () => {
    const { result } = renderHook(() =>
      useUserTableSearchState({
        search: {}
      })
    )

    act(() => {
      result.current.onFilterStateChange({
        globalFilter: "bob",
        selectFilters: {
          enabled: ["false"]
        }
      })
    })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users",
      replace: true,
      search: expect.any(Function)
    })

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(
      search({
        filter: "alice",
        page: "2",
        selected: "user-1"
      })
    ).toEqual({
      enabled: "false",
      filter: "bob",
      page: "2",
      selected: "user-1"
    })
  })

  it("clears empty user table filters", () => {
    expect(
      createUserTableSearchParams({
        globalFilter: "",
        selectFilters: {}
      })
    ).toEqual({
      enabled: undefined,
      filter: undefined
    })
  })
})
