import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import { AssetType } from "@exposurenexus/types/model/asset"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@exposurenexus/types/model/asset-custom-field"
import type { AssetCustomFieldValue } from "@exposurenexus/types/model/asset-custom-field"
import * as stories from "@/components/asset-detail-content.stories"
import {
  createAssetCustomFieldValuePayload,
  getAssetCustomFieldDraftValue
} from "@/components/asset-detail-content.tsx"
import { formatAssetCustomFieldValue } from "@/lib/asset-custom-fields.ts"

const mocks = vi.hoisted(() => ({
  toastActionError: vi.fn()
}))

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError
}))

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock
Element.prototype.scrollIntoView = () => undefined

const {
  CustomFieldsError,
  EmptyCustomFields,
  ErrorState,
  LoadingCustomFields,
  OwnerUpdateError,
  WithCustomFields
} = composeStories(stories)

beforeEach(() => {
  mocks.toastActionError.mockReset()
})

afterEach(() => {
  cleanup()
})

const selectValue: AssetCustomFieldValue = {
  fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
  key: "environment",
  name: "Environment",
  source: AssetCustomFieldValueSource.Asset,
  type: AssetCustomFieldType.Select,
  value: "production",
  options: [
    {
      id: "6b567696-6808-45be-ab67-a8683d98a138",
      fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
      value: "production",
      label: "Production"
    }
  ]
}

describe("asset detail custom field helpers", () => {
  it("formats select values with their option label", () => {
    expect(formatAssetCustomFieldValue(selectValue)).toBe("Production")
  })

  it("formats empty values and source labels", () => {
    const emptyValue: AssetCustomFieldValue = {
      fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
      key: "category",
      name: "Category",
      source: AssetCustomFieldValueSource.Empty,
      type: AssetCustomFieldType.Text,
      value: null
    }

    expect(formatAssetCustomFieldValue(emptyValue)).toBe("None")
    expect(getAssetCustomFieldDraftValue(emptyValue)).toBe("")
  })

  it("normalizes number edits for the asset value update payload", () => {
    const numberValue: AssetCustomFieldValue = {
      fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
      key: "priority",
      name: "Priority",
      source: AssetCustomFieldValueSource.Default,
      type: AssetCustomFieldType.Number,
      value: 3
    }

    expect(createAssetCustomFieldValuePayload(numberValue, "4")).toBe(4)
    expect(createAssetCustomFieldValuePayload(numberValue, "")).toBeNull()
  })
})

describe("AssetDetailContent stories", () => {
  it("renders custom fields in the asset sidebar", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Custom fields").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Category").length).toBeGreaterThan(0)
      expect(screen.getByText("Internet-facing")).toBeTruthy()
      expect(screen.getAllByText("Priority").length).toBeGreaterThan(0)
      expect(screen.getByText("3")).toBeTruthy()
      expect(screen.getAllByText("Environment").length).toBeGreaterThan(0)
      expect(screen.getByText("Production")).toBeTruthy()
      expect(screen.getByText("None")).toBeTruthy()
    })
  })

  it("renders no-owner and unknown owner states", async () => {
    const noOwnerAsset = {
      id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
      name: "web-01",
      type: AssetType.Host,
      ownerId: null
    }
    const unknownOwnerAsset = {
      ...noOwnerAsset,
      ownerId: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12"
    }

    const noOwner = render(<WithCustomFields asset={noOwnerAsset} />)

    await waitFor(() => {
      expect(screen.getAllByText("No Owner").length).toBeGreaterThan(0)
    })

    noOwner.unmount()

    render(<WithCustomFields asset={unknownOwnerAsset} />)

    await waitFor(() => {
      expect(screen.getAllByText("Unknown Owner").length).toBeGreaterThan(0)
    })
  })

  it("renders asset owners as user labels until owner editing starts", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
    })

    expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Edit asset owner" })
    ).toBeNull()

    const ownerLabels = screen.getAllByText("Robin Owner")
    fireEvent.click(ownerLabels[ownerLabels.length - 1])

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Asset owner" })).toBeTruthy()
    })
  })

  it("shows reset actions only for asset-specific values", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Reset Category" })
      ).toBeTruthy()
      expect(
        screen.getByRole("button", { name: "Reset Environment" })
      ).toBeTruthy()
      expect(
        screen.queryByRole("button", { name: "Reset Priority" })
      ).toBeNull()
    })
  })

  it("hides a custom field reset action while inline editing", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Reset Category" })
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByText("Internet-facing"))

    await waitFor(() => {
      expect(screen.getByDisplayValue("Internet-facing")).toBeTruthy()
      expect(
        screen.queryByRole("button", { name: "Reset Category" })
      ).toBeNull()
    })
  })

  it("keeps selected custom field values in the Storybook mock", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getByText("Production")).toBeTruthy()
    })

    fireEvent.click(screen.getByText("Production"))
    fireEvent.click(await screen.findByText("Staging"))

    await waitFor(() => {
      expect(screen.getByText("Staging")).toBeTruthy()
    })
  })

  it("assigns available custom fields from the sidebar picker", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add custom field" })
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }))
    fireEvent.click(await screen.findByText("Lifecycle"))

    await waitFor(() => {
      expect(screen.getAllByText("Lifecycle").length).toBeGreaterThan(0)
      expect(screen.getByRole("button", { name: "Remove Lifecycle" }))
    })
  })

  it("changes asset owners from the sidebar", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
    })

    const ownerLabels = screen.getAllByText("Robin Owner")
    fireEvent.click(ownerLabels[ownerLabels.length - 1])
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }))
    fireEvent.click(await screen.findByText("Morgan Owner"))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull()
      expect(screen.getAllByText("Morgan Owner").length).toBeGreaterThan(0)
    })
  })

  it("clears asset owners from the sidebar", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
    })

    const ownerLabels = screen.getAllByText("Robin Owner")
    fireEvent.click(ownerLabels[ownerLabels.length - 1])
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }))
    fireEvent.click(await screen.findByText("No Owner"))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull()
      expect(screen.getAllByText("No Owner").length).toBeGreaterThan(0)
    })
  })

  it("shows an error when asset owner updates fail", async () => {
    render(<OwnerUpdateError />)

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
    })

    const ownerLabels = screen.getAllByText("Robin Owner")
    fireEvent.click(ownerLabels[ownerLabels.length - 1])
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }))
    fireEvent.click(await screen.findByText("Morgan Owner"))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        expect.anything(),
        "Failed to update asset owner"
      )
    })
  })

  it("detaches custom fields from the asset sidebar", async () => {
    render(<WithCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("Team").length).toBeGreaterThan(0)
      expect(screen.getByRole("button", { name: "Remove Team" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Remove Team" }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove Team" })).toBeNull()
      expect(screen.queryByText("Team")).toBeNull()
    })
  })

  it("renders an empty custom field state", async () => {
    render(<EmptyCustomFields />)

    await waitFor(() => {
      expect(screen.getByText("No custom fields")).toBeTruthy()
    })
  })

  it("renders a loading state for custom fields without hiding asset details", async () => {
    const { container } = render(<LoadingCustomFields />)

    await waitFor(() => {
      expect(screen.getAllByText("web-01").length).toBeGreaterThan(0)
      expect(screen.getByLabelText("Custom fields loading")).toBeTruthy()
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
    })
  })

  it("renders a custom field error state without hiding asset details", async () => {
    render(<CustomFieldsError />)

    await waitFor(() => {
      expect(screen.getAllByText("web-01").length).toBeGreaterThan(0)
      expect(screen.getByText("Unable to load custom fields")).toBeTruthy()
    })
  })

  it("renders an error state when the primary asset query fails", async () => {
    render(<ErrorState />)

    await waitFor(() => {
      expect(screen.getByText("Unable to load asset")).toBeTruthy()
      expect(screen.getByText("Asset failed")).toBeTruthy()
    })
  })
})
