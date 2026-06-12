import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"

type SelectAssetCustomFieldDefinition = Extract<
  AssetCustomFieldDefinition,
  { options: Array<unknown> }
>

interface QueryState<TData> {
  data?: TData
  isPending: boolean
  isSuccess: boolean
}

const customFieldId = "7f732d2b-8985-4551-b45d-0eaf527a1577"

const mocks = vi.hoisted(() => {
  const customField: SelectAssetCustomFieldDefinition = {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "environment",
    name: "Environment",
    required: true,
    type: "select" as SelectAssetCustomFieldDefinition["type"],
    defaultValue: "production",
    options: [
      {
        id: "6b567696-6808-45be-ab67-a8683d98a138",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "production",
        label: "Production"
      }
    ]
  }
  const customFieldQuery: QueryState<AssetCustomFieldDefinition> = {
    data: customField,
    isPending: false,
    isSuccess: true
  }

  return {
    customField,
    customFieldQuery,
    navigate: vi.fn(),
    usePageMeta: vi.fn()
  }
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to
  }: {
    children: ReactNode
    className?: string
    to: string
  }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.customFieldQuery
}))

vi.mock("@/api/asset-custom-field.ts", () => ({
  createAssetCustomFieldDefinitionByIDQueryOptions: (id: string) => ({
    queryKey: ["asset-custom-fields", id]
  })
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/asset-custom-field-detail-content", () => ({
  AssetCustomFieldDetailContent: ({
    customFieldId: renderedCustomFieldId,
    titleAction
  }: {
    customFieldId: string
    titleAction?: ReactNode
  }) => (
    <div>
      {titleAction}
      <div>Custom field detail for {renderedCustomFieldId}</div>
    </div>
  )
}))

describe("CustomFieldDetailPage", () => {
  beforeEach(() => {
    mocks.customFieldQuery = {
      data: mocks.customField,
      isPending: false,
      isSuccess: true
    }
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("uses loaded custom field data for page metadata and renders the back link", async () => {
    const { CustomFieldDetailPage } = await import(
      "@/features/custom-fields/components/custom-field-detail-page.tsx"
    )

    render(<CustomFieldDetailPage customFieldId={customFieldId} />)

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Environment",
      description: "Review asset custom field settings and allowed values.",
      actions: [
        expect.objectContaining({
          label: "Edit custom field",
          onClick: expect.any(Function)
        })
      ]
    })
    const pageMeta = mocks.usePageMeta.mock.calls[0][0]
    pageMeta.actions[0].onClick()

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/$id/edit",
      params: { id: customFieldId }
    })
    expect(
      screen.getByRole("link", { name: /back to custom fields/i })
    ).toHaveAttribute("href", "/custom-fields")
    expect(
      screen.getByText(`Custom field detail for ${customFieldId}`)
    ).toBeVisible()
  })

  it("uses fallback page metadata before custom field data is available", async () => {
    const { CustomFieldDetailPage } = await import(
      "@/features/custom-fields/components/custom-field-detail-page.tsx"
    )
    mocks.customFieldQuery = {
      isPending: true,
      isSuccess: false
    }

    render(<CustomFieldDetailPage customFieldId={customFieldId} />)

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Custom Field",
      description: "Review asset custom field settings and allowed values.",
      actions: []
    })
  })
})
