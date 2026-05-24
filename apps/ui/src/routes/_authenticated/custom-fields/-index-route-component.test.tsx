import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import type { ReactNode } from "react"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"

const mocks = vi.hoisted(() => {
  const customField = {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "environment",
    name: "Environment",
    required: true,
    type: "select",
    defaultValue: "production",
    options: [
      {
        id: "6b567696-6808-45be-ab67-a8683d98a138",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "production",
        label: "Production"
      }
    ]
  } as AssetCustomFieldDefinition

  return {
    confirmDelete: vi.fn(),
    customField,
    deleteDefinitions: vi.fn(),
    dialogProps: undefined as undefined | Record<string, unknown>,
    navigate: vi.fn(),
    usePageMeta: vi.fn(),
    useQuery: vi.fn()
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@/api/asset-custom-field.ts", () => ({
  createListAssetCustomFieldDefinitionsQueryOptions: () => ({
    queryKey: ["asset-custom-fields"]
  })
}))

vi.mock("@/hooks/use-asset-custom-field-definition-lifecycle.ts", () => ({
  useAssetCustomFieldDefinitionLifecycle: () => ({
    deleteDefinitions: mocks.deleteDefinitions
  })
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDelete
  }
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/asset-custom-field-table", () => ({
  AssetCustomFieldTable: ({
    filterState,
    onCreateCustomField,
    onDeleteCustomFields,
    onFilterStateChange,
    onOpenCustomField,
    onSelectCustomField,
    selectedCustomFieldId
  }: {
    filterState?: unknown
    onCreateCustomField?: () => void
    onDeleteCustomFields?: (
      fields: Array<AssetCustomFieldDefinition>
    ) => Promise<void>
    onFilterStateChange?: (filterState: {
      globalFilter: string
      selectFilters: Record<string, Array<string>>
    }) => void
    onOpenCustomField?: (field: AssetCustomFieldDefinition) => void
    onSelectCustomField?: (field: AssetCustomFieldDefinition) => void
    selectedCustomFieldId?: string
  }) => (
    <div>
      <div data-testid="table-selected-custom-field">{selectedCustomFieldId}</div>
      <div data-testid="filter-state">{JSON.stringify(filterState)}</div>
      <button
        type="button"
        onClick={() => onSelectCustomField?.(mocks.customField)}
      >
        select custom field
      </button>
      <button
        type="button"
        onClick={() => onOpenCustomField?.(mocks.customField)}
      >
        open custom field
      </button>
      <button type="button" onClick={onCreateCustomField}>
        create custom field
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteCustomFields?.([mocks.customField])
        }}
      >
        delete custom field
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterStateChange?.({
            globalFilter: "environment",
            selectFilters: {
              required: ["true"],
              type: ["select"]
            }
          })
        }
      >
        change filters
      </button>
    </div>
  )
}))

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: (props: {
    children?: ReactNode
    description: string
    fullPageHref?: string
    onClose: () => void
    selectedId?: string
    title: string
  }) => {
    mocks.dialogProps = props

    return (
      <section>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div data-testid="selected-custom-field">{props.selectedId}</div>
        <div data-testid="full-page-href">{props.fullPageHref}</div>
        <button type="button" onClick={props.onClose}>
          close dialog
        </button>
        {props.children}
      </section>
    )
  }
}))

vi.mock("@/components/asset-custom-field-detail-content", () => ({
  AssetCustomFieldDetailContent: ({
    customFieldId
  }: {
    customFieldId: string
  }) => <div>Detail for custom field {customFieldId}</div>
}))

describe("CustomFieldsRouteComponent", () => {
  beforeEach(() => {
    mocks.confirmDelete.mockReset()
    mocks.confirmDelete.mockResolvedValue(true)
    mocks.deleteDefinitions.mockReset()
    mocks.deleteDefinitions.mockResolvedValue({
      successful: [mocks.customField],
      failed: []
    })
    mocks.dialogProps = undefined
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
    mocks.useQuery.mockReset()
    mocks.useQuery.mockReturnValue({
      data: [mocks.customField],
      isFetching: false,
      isPending: false,
      refetch: vi.fn()
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("passes route-owned filters and selected preview metadata to the table", async () => {
    const { CustomFieldsRouteComponent } = await import(
      "@/routes/_authenticated/custom-fields/-index-route-component.tsx"
    )

    render(
      <CustomFieldsRouteComponent
        search={{
          filter: "environment",
          required: "true",
          type: "text,select"
        }}
        selected={mocks.customField.id}
      />
    )

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Custom Fields",
      description: "Manage asset metadata fields."
    })
    expect(JSON.parse(screen.getByTestId("filter-state").textContent)).toEqual({
      globalFilter: "environment",
      selectFilters: {
        required: ["true"],
        type: ["text", "select"]
      }
    })
    expect(screen.getByTestId("table-selected-custom-field").textContent).toBe(
      mocks.customField.id
    )
    expect(screen.getByTestId("selected-custom-field").textContent).toBe(
      mocks.customField.id
    )
    expect(screen.getByTestId("full-page-href").textContent).toBe(
      `/custom-fields/${mocks.customField.id}`
    )
    expect(
      screen.getByText(`Detail for custom field ${mocks.customField.id}`)
    ).toBeTruthy()
  })

  it("updates route-owned filters and preserves unrelated search params", async () => {
    const { CustomFieldsRouteComponent } = await import(
      "@/routes/_authenticated/custom-fields/-index-route-component.tsx"
    )

    render(<CustomFieldsRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }))

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

  it("selects, opens, and creates custom fields from the table", async () => {
    const { CustomFieldsRouteComponent } = await import(
      "@/routes/_authenticated/custom-fields/-index-route-component.tsx"
    )

    render(<CustomFieldsRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /select custom field/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields",
      replace: true,
      search: expect.any(Function)
    })

    const selectSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(
      selectSearch({ filter: "environment", required: "true", type: "select" })
    ).toEqual({
      filter: "environment",
      required: "true",
      selected: mocks.customField.id,
      type: "select"
    })

    fireEvent.click(screen.getByRole("button", { name: /open custom field/i }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/$id",
      params: {
        id: mocks.customField.id
      }
    })

    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/new"
    })
  })

  it("closes the selected custom field preview after deleting that field", async () => {
    const { CustomFieldsRouteComponent } = await import(
      "@/routes/_authenticated/custom-fields/-index-route-component.tsx"
    )

    render(<CustomFieldsRouteComponent selected={mocks.customField.id} />)
    fireEvent.click(screen.getByRole("button", { name: /delete custom field/i }))

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Custom Fields",
        description: "This action cannot be undone",
        message: "Are you sure you want to delete 1 custom field(s)?",
        confirmVariant: "destructive"
      })
      expect(mocks.deleteDefinitions).toHaveBeenCalledWith([mocks.customField])
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/custom-fields",
        replace: true,
        search: expect.any(Function)
      })
    })

    const clearSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(
      clearSearch({
        filter: "environment",
        required: "true",
        selected: mocks.customField.id,
        type: "select"
      })
    ).toEqual({
      filter: "environment",
      required: "true",
      selected: undefined,
      type: "select"
    })
  })
})
