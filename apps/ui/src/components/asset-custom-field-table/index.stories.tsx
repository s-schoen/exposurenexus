import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import type { UseQueryResult } from "@tanstack/react-query"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { AssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import { AssetCustomFieldTable } from "@/components/asset-custom-field-table"

type AssetCustomFieldTableStoryArgs = {
  selectedCustomFieldId?: string
  onSelectCustomField?: (field: AssetCustomFieldDefinition) => void
  onOpenCustomField?: (field: AssetCustomFieldDefinition) => void
  fields: Array<AssetCustomFieldDefinition>
  pending?: boolean
}

function createQueryResult({
  data,
  isFetching,
  isPending,
  refetch
}: {
  data: Array<AssetCustomFieldDefinition> | undefined
  isFetching: boolean
  isPending: boolean
  refetch: () => Promise<unknown>
}): UseQueryResult<Array<AssetCustomFieldDefinition>, Error> {
  return {
    data,
    error: null,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isError: false,
    isFetched: !isPending,
    isFetchedAfterMount: !isPending,
    isFetching,
    isInitialLoading: isPending,
    isLoading: isPending,
    isLoadingError: false,
    isPaused: false,
    isPending,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: isFetching,
    isStale: false,
    isSuccess: !isPending,
    status: isPending ? "pending" : "success",
    fetchStatus: isFetching || isPending ? "fetching" : "idle",
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    isEnabled: true,
    promise: Promise.resolve(data ?? []),
    refetch
  } as unknown as UseQueryResult<Array<AssetCustomFieldDefinition>, Error>
}

function AssetCustomFieldTableStoryShell({
  fields,
  pending = false,
  selectedCustomFieldId,
  onSelectCustomField,
  onOpenCustomField
}: AssetCustomFieldTableStoryArgs) {
  const [filterState, setFilterState] = useState<DataTableFilterState>({
    globalFilter: "",
    selectFilters: {}
  })

  return (
    <div className="w-full max-w-6xl">
      <AssetCustomFieldTable
        query={createQueryResult({
          data: pending ? undefined : fields,
          isFetching: false,
          isPending: pending,
          refetch: () => Promise.resolve({ data: fields })
        })}
        selectedCustomFieldId={selectedCustomFieldId}
        onSelectCustomField={onSelectCustomField}
        onOpenCustomField={onOpenCustomField}
        filterState={filterState}
        onFilterStateChange={setFilterState}
      />
    </div>
  )
}

const meta = {
  title: "Components/AssetCustomFieldTable",
  component: AssetCustomFieldTableStoryShell,
  tags: ["!test"],
  parameters: {
    layout: "padded"
  },
  args: {
    fields: ASSET_CUSTOM_FIELD_FIXTURES
  },
  render: (args) => <AssetCustomFieldTableStoryShell {...args} />
} satisfies Meta<typeof AssetCustomFieldTableStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
  args: {
    pending: true
  }
}

export const Empty: Story = {
  args: {
    fields: []
  }
}

export const ActiveRow: Story = {
  args: {
    selectedCustomFieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577"
  }
}

export const Selection: Story = {
  args: {
    onSelectCustomField: fn(),
    onOpenCustomField: fn()
  },
  play: async ({ canvas, args }) => {
    const rowLabel = await canvas.findByText("Environment")

    await userEvent.click(rowLabel)
    await expect(args.onSelectCustomField).toHaveBeenCalled()

    await userEvent.dblClick(rowLabel)
    await expect(args.onOpenCustomField).toHaveBeenCalled()
  }
}
