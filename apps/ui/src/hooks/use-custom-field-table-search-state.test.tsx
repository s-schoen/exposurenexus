import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCustomFieldTableFilterState,
  createCustomFieldTableSearchParams,
  useCustomFieldTableSearchState,
  validateCustomFieldTableSearch
} from "@/hooks/use-custom-field-table-search-state.ts"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn()
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

describe("useCustomFieldTableSearchState", () => {
  afterEach(() => {
    cleanup()
    mocks.navigate.mockReset()
  })

  it("validates custom field table filter search params", () => {
    expect(
      validateCustomFieldTableSearch({
        filter: "environment",
        required: ["true,false", 42],
        type: "text,select"
      })
    ).toEqual({
      filter: "environment",
      required: "true,false",
      type: "text,select"
    })
  })

  it("creates custom field table filter state from route search", () => {
    expect(
      createCustomFieldTableFilterState({
        filter: "environment",
        required: "true,false",
        type: "text,select"
      })
    ).toEqual({
      globalFilter: "environment",
      selectFilters: {
        required: ["true", "false"],
        type: ["text", "select"]
      }
    })
  })

  it("serializes custom field table filters back to search params", () => {
    expect(
      createCustomFieldTableSearchParams({
        globalFilter: "environment",
        selectFilters: {
          required: ["true"],
          type: ["select"]
        }
      })
    ).toEqual({
      filter: "environment",
      required: "true",
      type: "select"
    })
  })

  it("updates the custom field route search state and preserves unrelated params", () => {
    const { result } = renderHook(() =>
      useCustomFieldTableSearchState({
        search: {}
      })
    )

    act(() => {
      result.current.onFilterStateChange({
        globalFilter: "environment",
        selectFilters: {
          required: ["true"],
          type: ["select"]
        }
      })
    })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields",
      replace: true,
      search: expect.any(Function)
    })

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(search({ page: "2", selected: "field-1" })).toEqual({
      filter: "environment",
      page: "2",
      required: "true",
      selected: "field-1",
      type: "select"
    })
  })

  it("clears empty custom field table filters", () => {
    expect(
      createCustomFieldTableSearchParams({
        globalFilter: "",
        selectFilters: {}
      })
    ).toEqual({
      filter: undefined,
      required: undefined,
      type: undefined
    })
  })
})
