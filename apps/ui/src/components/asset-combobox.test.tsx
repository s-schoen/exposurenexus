import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import type { Asset, AssetType } from "@openvlp/types/model/asset"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
Element.prototype.scrollIntoView = () => undefined

interface QueryState {
  data?: Array<Asset>
  isLoading: boolean
}

const mocks = vi.hoisted(() => {
  const assets: Array<Asset> = [
    {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      name: "api-01",
      type: "host" as AssetType
    },
    {
      id: "0bb9b410-7763-4e7a-9942-b752367fd63d",
      name: "container-01",
      type: "container" as AssetType
    }
  ]

  return {
    assets,
    query: {
      data: assets,
      isLoading: false
    } as QueryState
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.query
}))

vi.mock("@/api/asset.ts", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"]
  })
}))

beforeEach(() => {
  mocks.query = {
    data: mocks.assets,
    isLoading: false
  }
})

afterEach(() => {
  cleanup()
})

describe("AssetCombobox", () => {
  it("disables the combobox while assets are loading", async () => {
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx")
    mocks.query = {
      isLoading: true
    }

    render(<AssetCombobox />)

    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true)
  })

  it("renders the empty state when no assets are available", async () => {
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx")
    mocks.query = {
      data: [],
      isLoading: false
    }

    render(<AssetCombobox />)
    fireEvent.click(screen.getByRole("combobox"))

    expect(await screen.findByText("No assets available")).toBeTruthy()
  })

  it("selects an asset, renders the selected label, and calls onChange", async () => {
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx")
    const onChange = vi.fn()

    render(<AssetCombobox onChange={onChange} />)
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.click(await screen.findByText("api-01"))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(mocks.assets[0])
    })
    expect(screen.getByRole("combobox").textContent).toContain("api-01")
  })
})
