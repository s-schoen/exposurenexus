import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import type { UseQueryResult } from "@tanstack/react-query"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Role } from "@openvlp/types/model/rbac"
import type { DataTableFilterState } from "@/components/data-table/types.ts"
import { ROLE_FIXTURES } from "@/components/role-fixtures.ts"
import { RoleTable } from "@/components/role-table"

type RoleTableStoryArgs = {
  selectedRoleId?: string
  onSelectRole?: (role: Role) => void
  onOpenRole?: (role: Role) => void
  roles: Array<Role>
  pending?: boolean
}

function createQueryResult({
  data,
  isFetching,
  isPending,
  refetch
}: {
  data: Array<Role> | undefined
  isFetching: boolean
  isPending: boolean
  refetch: () => Promise<unknown>
}): UseQueryResult<Array<Role>, Error> {
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
    promise: isPending
      ? (new Promise<Array<Role>>(() => {}) as Promise<Array<Role>>)
      : Promise.resolve(data ?? []),
    refetch
  } as unknown as UseQueryResult<Array<Role>, Error>
}

function RoleTableStoryShell({
  roles,
  pending = false,
  selectedRoleId,
  onSelectRole,
  onOpenRole
}: RoleTableStoryArgs) {
  const [filterState, setFilterState] = useState<DataTableFilterState>({
    globalFilter: "",
    selectFilters: {}
  })

  return (
    <div className="w-full max-w-6xl">
      <RoleTable
        query={
          createQueryResult({
            data: pending ? undefined : roles,
            isFetching: false,
            isPending: pending,
            refetch: () => Promise.resolve({ data: roles })
          })
        }
        selectedRoleId={selectedRoleId}
        onSelectRole={onSelectRole}
        onOpenRole={onOpenRole}
        filterState={filterState}
        onFilterStateChange={setFilterState}
      />
    </div>
  )
}

const meta = {
  title: "Components/RoleTable",
  component: RoleTableStoryShell,
  parameters: {
    layout: "padded"
  },
  args: {
    roles: ROLE_FIXTURES
  },
  render: (args) => <RoleTableStoryShell {...args} />
} satisfies Meta<typeof RoleTableStoryShell>

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
    roles: []
  }
}

export const ActiveRow: Story = {
  args: {
    selectedRoleId: "0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03"
  }
}

export const Selection: Story = {
  args: {
    onSelectRole: fn(),
    onOpenRole: fn()
  },
  play: async ({ canvas, args }) => {
    const rowLabel = await canvas.findByText("security-auditor")

    await userEvent.click(rowLabel)
    await expect(args.onSelectRole).toHaveBeenCalled()

    await userEvent.dblClick(rowLabel)
    await expect(args.onOpenRole).toHaveBeenCalled()
  }
}
