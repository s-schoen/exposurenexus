import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { AssetType } from "@exposurenexus/types/model/asset"
import type { ReactNode } from "react"
import type { AssetWithCustomFields } from "@exposurenexus/types/model/asset"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import { getAssetCustomFieldColumnId } from "@/components/asset-table/columns.tsx"

const mocks = vi.hoisted(() => {
  const asset: AssetWithCustomFields = {
    id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
    name: "api-01",
    type: "host" as AssetType,
    ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    customFields: []
  }
  const users = [
    {
      id: asset.ownerId!,
      username: "robin",
      displayName: "Robin Owner",
      email: "robin@example.com",
      enabled: false,
      roleIds: []
    }
  ]

  return {
    asset,
    assetDialogCall: vi.fn(),
    confirmDialogCall: vi.fn(),
    createAsset: vi.fn(),
    dataTableProps: undefined as undefined | Record<string, unknown>,
    deleteAsset: vi.fn(),
    invalidateQueries: vi.fn(),
    locationSearch: {},
    navigate: vi.fn(),
    toastActionError: vi.fn(),
    toastSuccess: vi.fn(),
    users
  }
})

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({
    search: mocks.locationSearch
  }),
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "asset-custom-fields") {
      return {
        data: ASSET_CUSTOM_FIELD_FIXTURES,
        isPending: false,
        isSuccess: true
      }
    }

    if (options.queryKey.join("/") === "users") {
      return {
        data: mocks.users,
        isPending: false,
        isSuccess: true
      }
    }

    return {
      data: [mocks.asset],
      isPending: false,
      isSuccess: true
    }
  },
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries
  })
}))

vi.mock("@/api/asset.ts", () => ({
  createAsset: mocks.createAsset,
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"]
  }),
  createListAssetsWithCustomFieldsQueryOptions: () => ({
    queryKey: ["assets", "with-custom-fields"]
  }),
  deleteAsset: mocks.deleteAsset
}))

vi.mock("@/api/asset-custom-field.ts", () => ({
  createListAssetCustomFieldDefinitionsQueryOptions: () => ({
    queryKey: ["asset-custom-fields"]
  })
}))

vi.mock("@/components/asset-dialog.tsx", () => ({
  AssetDialog: {
    call: mocks.assetDialogCall
  }
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall
  }
}))

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess
  }
}))

vi.mock("@/components/data-table/data-table.tsx", () => ({
  DataTable: (props: Record<string, unknown>) => {
    mocks.dataTableProps = props

    const toolbarControls = props.toolbarControls as ReactNode
    const onRowClick = props.onRowClick as
      | ((asset: AssetWithCustomFields) => void)
      | undefined
    const onRowDoubleClick = props.onRowDoubleClick as
      | ((asset: AssetWithCustomFields) => void)
      | undefined
    const onRowDelete = props.onRowDelete as
      | ((assets: Array<AssetWithCustomFields>) => Promise<void>)
      | undefined
    const onFilterStateChange = props.onFilterStateChange as
      | ((state: unknown) => void)
      | undefined
    const isRowActive = props.isRowActive as
      | ((asset: AssetWithCustomFields) => boolean)
      | undefined

    return (
      <div>
        <div data-testid="active-row">{String(isRowActive?.(mocks.asset))}</div>
        <div data-testid="toolbar">{toolbarControls}</div>
        <button type="button" onClick={() => onRowClick?.(mocks.asset)}>
          select row
        </button>
        <button type="button" onClick={() => onRowDoubleClick?.(mocks.asset)}>
          open row
        </button>
        <button type="button" onClick={() => void onRowDelete?.([mocks.asset])}>
          delete rows
        </button>
        <button
          type="button"
          onClick={() =>
            onFilterStateChange?.({
              globalFilter: "edge",
              selectFilters: {
                [getAssetCustomFieldColumnId(
                  "7f732d2b-8985-4551-b45d-0eaf527a1577"
                )]: ["production", "staging"]
              },
              textFilters: {
                [getAssetCustomFieldColumnId(
                  "8f0365b2-1bbb-46e2-b1f4-06300ade23f3"
                )]: "internet"
              },
              numberFilters: {
                [getAssetCustomFieldColumnId(
                  "2808e68c-9a48-4b50-9a2d-d1df4c83ff06"
                )]: "3"
              }
            })
          }
        >
          change filters
        </button>
      </div>
    )
  }
}))

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("AssetTable workflow wiring", () => {
  beforeEach(() => {
    mocks.assetDialogCall.mockReset()
    mocks.confirmDialogCall.mockReset()
    mocks.createAsset.mockReset()
    mocks.dataTableProps = undefined
    mocks.deleteAsset.mockReset()
    mocks.invalidateQueries.mockReset()
    mocks.locationSearch = {}
    mocks.navigate.mockReset()
    mocks.toastActionError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("passes route filter state, active row state, and row handlers to DataTable", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    const onSelectAsset = vi.fn()
    mocks.locationSearch = {
      category: "internet",
      environment: "production,staging",
      filter: "api",
      priority: "3"
    }

    render(
      <AssetTable
        selectedAssetId={mocks.asset.id}
        onSelectAsset={onSelectAsset}
      />
    )

    expect(screen.getByTestId("active-row").textContent).toBe("true")
    expect(mocks.dataTableProps?.filterState).toEqual({
      globalFilter: "api",
      selectFilters: {
        [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
          "production",
          "staging"
        ]
      },
      textFilters: {
        [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]:
          "internet"
      },
      numberFilters: {
        [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]:
          "3"
      }
    })
    expect(mocks.dataTableProps?.initialColumnVisibility).toEqual({
      [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]:
        false,
      [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]:
        false,
      [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]:
        false
    })
    const ownerColumn = (
      mocks.dataTableProps?.columns as Array<{
        id?: string
        accessorFn?: (asset: AssetWithCustomFields, index: number) => unknown
      }>
    ).find((column) => column.id === "ownerId")
    expect(ownerColumn?.accessorFn?.(mocks.asset, 0)).toBe("Robin Owner")

    fireEvent.click(screen.getByRole("button", { name: /select row/i }))
    expect(onSelectAsset).toHaveBeenCalledWith(mocks.asset)

    fireEvent.click(screen.getByRole("button", { name: /open row/i }))
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/assets/$id",
        params: {
          id: mocks.asset.id
        }
      })
    })
  })

  it("serializes filter changes back to route search params", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/assets",
      replace: true,
      search: expect.any(Function)
    })

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(
      search({
        category: "old",
        customFields: "visible",
        filter: "old",
        selected: mocks.asset.id
      })
    ).toEqual({
      category: "internet",
      customFields: undefined,
      environment: "production,staging",
      filter: "edge",
      priority: "3",
      selected: mocks.asset.id
    })
  })

  it("does not delete assets when the confirmation is cancelled", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    mocks.confirmDialogCall.mockResolvedValueOnce(false)

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }))
    await flushPromises()

    expect(mocks.deleteAsset).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it("deletes confirmed assets and invalidates asset queries", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    mocks.confirmDialogCall.mockResolvedValueOnce(true)
    mocks.deleteAsset.mockResolvedValueOnce(mocks.asset)

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }))

    await waitFor(() => {
      expect(mocks.deleteAsset).toHaveBeenCalledWith(mocks.asset.id)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Deleted 1 asset(s)!")
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets"]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets", "with-custom-fields"]
    })
  })

  it("reports asset deletion failures and still refreshes asset queries", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    const error = new Error("Delete failed")
    mocks.confirmDialogCall.mockResolvedValueOnce(true)
    mocks.deleteAsset.mockRejectedValueOnce(error)

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        error,
        `Failed to delete asset ${mocks.asset.id}: ${error}`
      )
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets"]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets", "with-custom-fields"]
    })
  })

  it("does not create an asset when the asset dialog is cancelled", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    mocks.assetDialogCall.mockResolvedValueOnce(null)

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }))
    await flushPromises()

    expect(mocks.createAsset).not.toHaveBeenCalled()
  })

  it("creates assets from the asset dialog and invalidates asset queries", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    mocks.assetDialogCall.mockResolvedValueOnce({
      id: "",
      name: "worker-01",
      type: AssetType.Container,
      ownerId: null
    })
    mocks.createAsset.mockResolvedValueOnce({
      id: "08488dd1-4f23-445b-81e5-74e76361caa0",
      name: "worker-01",
      type: AssetType.Container,
      ownerId: null
    })

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }))

    await waitFor(() => {
      expect(mocks.createAsset).toHaveBeenCalledWith(
        "worker-01",
        AssetType.Container,
        null
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Created new asset worker-01"
    )
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets"]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["assets", "with-custom-fields"]
    })
  })

  it("reports asset creation failures", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    const error = new Error("Create failed")
    mocks.assetDialogCall.mockResolvedValueOnce({
      id: "",
      name: "worker-01",
      type: AssetType.Container,
      ownerId: null
    })
    mocks.createAsset.mockRejectedValueOnce(error)

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        error,
        `Failed to create asset: ${error}`
      )
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it("passes selected owner ids when creating assets", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx")
    mocks.assetDialogCall.mockResolvedValueOnce({
      id: "",
      name: "worker-01",
      type: AssetType.Container,
      ownerId: mocks.asset.ownerId
    })
    mocks.createAsset.mockResolvedValueOnce({
      id: "08488dd1-4f23-445b-81e5-74e76361caa0",
      name: "worker-01",
      type: AssetType.Container,
      ownerId: mocks.asset.ownerId
    })

    render(<AssetTable />)
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }))

    await waitFor(() => {
      expect(mocks.createAsset).toHaveBeenCalledWith(
        "worker-01",
        AssetType.Container,
        mocks.asset.ownerId
      )
    })
  })
})
