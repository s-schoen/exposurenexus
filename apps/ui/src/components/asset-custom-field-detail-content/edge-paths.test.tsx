import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within
} from "@testing-library/react"
import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field"
import type { ReactNode } from "react"
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition
} from "@exposurenexus/types/model/asset-custom-field"
import type * as AssetCustomFieldApi from "@/api/asset-custom-field.ts"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"
import { createAssetCustomFieldDefinitionByIDQueryOptions } from "@/api/asset-custom-field.ts"
import {
  createTestQueryClient,
  renderWithQueryClient
} from "@/test/harness.tsx"

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  selectId: 0,
  toastActionError: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateAssetCustomFieldDefinition: vi.fn()
}))

vi.mock("@/api/asset-custom-field.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AssetCustomFieldApi>()

  return {
    ...actual,
    updateAssetCustomFieldDefinition: mocks.updateAssetCustomFieldDefinition,
    useUpdateAssetCustomFieldDefinitionMutation: () => ({
      mutateAsync: ({
        id,
        definition
      }: {
        id: string
        definition: CreateAssetCustomFieldDefinition
      }) => mocks.updateAssetCustomFieldDefinition(id, definition)
    })
  }
})

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}))

vi.mock("@/components/ui/select.tsx", async () => {
  const React = await import("react")
  const SelectContext = React.createContext<
    undefined | ((value: string) => void)
  >(undefined)

  return {
    Select: ({
      children,
      onValueChange
    }: {
      children: ReactNode
      onValueChange?: (value: string) => void
    }) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value
    }: {
      children: ReactNode
      value: string
    }) => {
      const onValueChange = React.useContext(SelectContext)

      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children }: { children: ReactNode }) => (
      <button type="button" role="combobox">
        {children}
      </button>
    )
  }
})

function getFixture(type: AssetCustomFieldType) {
  const fixture = ASSET_CUSTOM_FIELD_FIXTURES.find(
    (field) => field.type === type
  )

  if (!fixture) {
    throw new Error(`Missing ${type} fixture`)
  }

  return cloneField(fixture)
}

function cloneField(
  field: AssetCustomFieldDefinition
): AssetCustomFieldDefinition {
  if (field.type !== AssetCustomFieldType.Select) {
    return { ...field }
  }

  return {
    ...field,
    options: field.options.map((option) => ({ ...option }))
  }
}

function createFieldFromPayload(
  id: string,
  payload: CreateAssetCustomFieldDefinition
): AssetCustomFieldDefinition {
  const base = {
    id,
    key: payload.key,
    name: payload.name,
    required: payload.required
  }

  if (payload.type !== AssetCustomFieldType.Select) {
    return {
      ...base,
      type: payload.type,
      defaultValue: payload.defaultValue ?? null
    } as AssetCustomFieldDefinition
  }

  return {
    ...base,
    type: AssetCustomFieldType.Select,
    defaultValue: payload.defaultValue ?? null,
    options: payload.options.map((option, index) => ({
      id: `updated-option-${index}`,
      fieldId: id,
      value: option.value,
      label: option.label
    }))
  }
}

function createQueryClient() {
  const queryClient = createTestQueryClient()
  const invalidateQueries = queryClient.invalidateQueries.bind(queryClient)
  queryClient.invalidateQueries = (...args) => {
    mocks.invalidateQueries(...args)
    return invalidateQueries(...args)
  }

  return queryClient
}

function renderDetail(field: AssetCustomFieldDefinition) {
  const queryClient = createQueryClient()

  const view = renderWithQueryClient(
    <AssetCustomFieldDetailContent customFieldId={field.id} />,
    {
      queryClient,
      queryData: [
        {
          queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(field.id)
            .queryKey,
          data: field
        }
      ]
    }
  )

  return view
}

function optionRow(label: string) {
  const button = screen.getByRole("button", { name: `Remove ${label}` })
  const row = button.parentElement

  if (!row) {
    throw new Error(`Missing option row for ${label}`)
  }

  return row
}

function latestPayload() {
  const call = mocks.updateAssetCustomFieldDefinition.mock.calls.at(-1)

  if (!call) {
    throw new Error("Expected updateAssetCustomFieldDefinition to be called")
  }

  return call[1] as CreateAssetCustomFieldDefinition
}

beforeEach(() => {
  mocks.invalidateQueries.mockReset()
  mocks.selectId = 0
  mocks.toastActionError.mockReset()
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.updateAssetCustomFieldDefinition.mockReset()
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    mocks.selectId += 1
    return `optimistic-option-${mocks.selectId}` as `${string}-${string}-${string}-${string}-${string}`
  })
  mocks.updateAssetCustomFieldDefinition.mockImplementation(
    (id: string, payload: CreateAssetCustomFieldDefinition) =>
      Promise.resolve(createFieldFromPayload(id, payload))
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("AssetCustomFieldDetailContent edge paths", () => {
  it("adds a select option and saves the expanded option payload", async () => {
    const field = getFixture(AssetCustomFieldType.Select)

    renderDetail(field)
    fireEvent.click(screen.getByRole("button", { name: /add option/i }))

    await waitFor(() => {
      expect(mocks.updateAssetCustomFieldDefinition).toHaveBeenCalledTimes(1)
    })
    expect(latestPayload()).toMatchObject({
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
        { value: "option_3", label: "Option 3" }
      ]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it("edits and removes selectable options", async () => {
    const field = getFixture(AssetCustomFieldType.Select)

    renderDetail(field)

    fireEvent.click(within(optionRow("Staging")).getByText("Staging"))
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Stage" }
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })

    await waitFor(() => {
      expect(latestPayload()).toMatchObject({
        options: [
          { value: "production", label: "Production" },
          { value: "staging", label: "Stage" }
        ]
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Remove Stage" }))

    await waitFor(() => {
      expect(latestPayload()).toMatchObject({
        options: [{ value: "production", label: "Production" }]
      })
    })
  })

  it("saves number default edits with the numeric payload shape", async () => {
    const field = getFixture(AssetCustomFieldType.Number)

    renderDetail(field)

    const editableDefault = screen.getAllByText("3").at(-1)
    expect(editableDefault).toBeTruthy()

    fireEvent.click(editableDefault!)
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "5" }
    })
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" })

    await waitFor(() => {
      expect(latestPayload()).toMatchObject({
        key: "priority",
        name: "Priority",
        required: true,
        type: AssetCustomFieldType.Number,
        defaultValue: 5
      })
    })
  })

  it("shows default fallback display and saves text default edits", async () => {
    const field = getFixture(AssetCustomFieldType.Text)

    renderDetail(field)

    expect(screen.getAllByText("None").length).toBeGreaterThan(0)

    const editableDefault = screen.getAllByText("None").at(-1)
    expect(editableDefault).toBeTruthy()

    fireEvent.click(editableDefault!)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "internet-facing" }
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })

    await waitFor(() => {
      expect(latestPayload()).toMatchObject({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: "internet-facing"
      })
    })
  })

  it("rejects invalid edits without sending an API request", () => {
    const field = getFixture(AssetCustomFieldType.Select)

    renderDetail(field)
    fireEvent.click(within(optionRow("Production")).getByText("production"))
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "staging" }
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Option values must be unique"
    )
    expect(mocks.updateAssetCustomFieldDefinition).not.toHaveBeenCalled()
  })

  it("rolls optimistic option edits back after API failure", async () => {
    const field = getFixture(AssetCustomFieldType.Select)
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    mocks.updateAssetCustomFieldDefinition.mockRejectedValueOnce(
      new Error("Update failed")
    )

    const { queryClient } = renderDetail(field)
    fireEvent.click(screen.getByRole("button", { name: /add option/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        expect.any(Error),
        "Failed to update custom field"
      )
    })
    expect(consoleError).toHaveBeenCalled()
    expect(
      queryClient.getQueryData(
        createAssetCustomFieldDefinitionByIDQueryOptions(field.id).queryKey
      )
    ).toEqual(field)
    expect(screen.queryByText("Option 3")).toBeNull()
  })
})
