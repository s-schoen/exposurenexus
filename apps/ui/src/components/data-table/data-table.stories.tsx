import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router"
import { DatabaseBackup } from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { fn } from "storybook/test"

import type { UseQueryResult } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

import type { GroupingOption } from "@/components/data-table/types"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type StoryFindingStatus = "active" | "review" | "mitigated"
type StoryFindingSource = "scanner" | "manual" | "vendor-feed"

interface StoryFinding {
  id: string
  title: string
  status: StoryFindingStatus
  source: StoryFindingSource
  owner: string
  updatedAt: string
}

interface DataTableStoryArgs {
  rows: Array<StoryFinding>
  pending?: boolean
  initialGrouping?: Array<string>
  showToolbarControls?: boolean
  activeRowId?: string
  onExport?: () => void
}

const statusLabel: Record<StoryFindingStatus, string> = {
  active: "Active",
  review: "In Review",
  mitigated: "Mitigated"
}

const statusClassName: Record<StoryFindingStatus, string> = {
  active:
    "rounded-full border-[oklch(0.74_0.11_32)] bg-[oklch(0.94_0.05_28)] text-[oklch(0.44_0.16_28)]",
  review:
    "rounded-full border-[oklch(0.8_0.085_72)] bg-[oklch(0.96_0.03_72)] text-[oklch(0.46_0.115_66)]",
  mitigated:
    "rounded-full border-[oklch(0.85_0.036_102)] bg-[oklch(0.975_0.012_102)] text-[oklch(0.45_0.045_102)]"
}

const sourceLabel: Record<StoryFindingSource, string> = {
  scanner: "Scanner",
  manual: "Manual",
  "vendor-feed": "Vendor Feed"
}

const defaultRows: Array<StoryFinding> = [
  {
    id: "finding-001",
    title: "Exposed admin interface",
    status: "active",
    source: "scanner",
    owner: "Platform",
    updatedAt: "2026-04-16T08:45:00.000Z"
  },
  {
    id: "finding-002",
    title: "Outdated dependency in API worker",
    status: "review",
    source: "vendor-feed",
    owner: "Backend",
    updatedAt: "2026-04-15T14:20:00.000Z"
  },
  {
    id: "finding-003",
    title: "Missing MFA enforcement for staging",
    status: "active",
    source: "manual",
    owner: "Identity",
    updatedAt: "2026-04-14T10:05:00.000Z"
  },
  {
    id: "finding-004",
    title: "Public S3 bucket policy drift",
    status: "mitigated",
    source: "scanner",
    owner: "Cloud",
    updatedAt: "2026-04-12T17:30:00.000Z"
  },
  {
    id: "finding-005",
    title: "Leaked test credential in CI log",
    status: "review",
    source: "manual",
    owner: "DevOps",
    updatedAt: "2026-04-11T09:15:00.000Z"
  },
  {
    id: "finding-006",
    title: "Legacy endpoint missing rate limiting",
    status: "active",
    source: "vendor-feed",
    owner: "Edge",
    updatedAt: "2026-04-10T12:00:00.000Z"
  }
]

const groupingOptions: Array<GroupingOption> = [
  {
    id: "status",
    label: "Status",
    formatValue: (value) => statusLabel[value as StoryFindingStatus]
  },
  {
    id: "source",
    label: "Source",
    formatValue: (value) => sourceLabel[value as StoryFindingSource]
  }
]

const columns: Array<ColumnDef<StoryFinding>> = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Finding" />
    ),
    cell: ({ row }) => (
      <div className="min-w-0 py-0.5">
        <div className="truncate font-medium text-foreground">
          {row.original.title}
        </div>
      </div>
    )
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue<StoryFindingStatus>("status")

      return (
        <Badge variant="outline" className={statusClassName[status]}>
          {statusLabel[status]}
        </Badge>
      )
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true
      }

      return filterValue.includes(row.getValue("status"))
    },
    meta: {
      label: "Status",
      filterVariant: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "In Review", value: "review" },
        { label: "Mitigated", value: "mitigated" }
      ]
    }
  },
  {
    accessorKey: "source",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    cell: ({ row }) => {
      const source = row.getValue<StoryFindingSource>("source")

      return (
        <span className="inline-flex rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {sourceLabel[source]}
        </span>
      )
    }
  },
  {
    accessorKey: "owner",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Owner" />
    )
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Updated" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {new Date(row.original.updatedAt).toLocaleDateString()}
      </span>
    )
  }
]

const DataTableStoryContentContext = createContext<ReactNode | null>(null)

function StoryRoot() {
  return (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  )
}

function StoryIndex() {
  const content = useContext(DataTableStoryContentContext)

  return content
}

function createQueryResult<TData>({
  data,
  isFetching,
  isPending,
  refetch
}: {
  data: Array<TData> | undefined
  isFetching: boolean
  isPending: boolean
  refetch: () => Promise<unknown>
}): UseQueryResult<Array<TData>, Error> {
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
    promise: Promise.resolve(data) as Promise<Array<TData>>,
    refetch
  } as unknown as UseQueryResult<Array<TData>, Error>
}

function DataTableStoryRouter({ children }: { children: ReactNode }) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({
      component: StoryRoot
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: StoryIndex
    })

    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({
        initialEntries: ["/"]
      })
    })
  }, [])

  return (
    <DataTableStoryContentContext.Provider value={children}>
      <RouterProvider router={router as never} />
    </DataTableStoryContentContext.Provider>
  )
}

function DataTableStoryShell({
  rows,
  pending = false,
  initialGrouping = [],
  showToolbarControls = false,
  activeRowId,
  onExport = fn()
}: DataTableStoryArgs) {
  const [currentRows, setCurrentRows] = useState(rows)
  const [isFetching, setIsFetching] = useState(false)

  useEffect(() => {
    setCurrentRows(rows)
  }, [rows])

  const handleRefresh = async () => {
    if (pending) {
      return {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
        isSuccess: false,
        status: "pending"
      }
    }

    setIsFetching(true)
    await new Promise((resolve) => setTimeout(resolve, 450))
    setIsFetching(false)

    return {
      data: currentRows,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: "success"
    }
  }

  const query = createQueryResult({
    data: pending ? undefined : currentRows,
    isFetching,
    isPending: pending,
    refetch: handleRefresh
  })

  return (
    <DataTableStoryRouter>
      <div className="w-full space-y-4">
        <DataTable
          columns={columns}
          query={query}
          groupingOptions={groupingOptions}
          initialGrouping={initialGrouping}
          onRowDelete={async (selectedRows) => {
            await Promise.resolve()
            setCurrentRows((existingRows) =>
              existingRows.filter(
                (row) =>
                  !selectedRows.some((selectedRow) => selectedRow.id === row.id)
              )
            )
          }}
          onRowClick={fn()}
          onRowDoubleClick={fn()}
          isRowActive={
            activeRowId ? (row) => row.id === activeRowId : undefined
          }
          toolbarControls={
            showToolbarControls ? (
              <Button
                variant="default"
                size="sm"
                className="h-9 rounded-xl"
                onClick={onExport}
              >
                <DatabaseBackup />
                Export CSV
              </Button>
            ) : undefined
          }
        />
      </div>
    </DataTableStoryRouter>
  )
}

const meta = {
  title: "Components/DataTable",
  component: DataTableStoryShell,
  parameters: {
    layout: "padded"
  },
  args: {
    rows: defaultRows,
    pending: false,
    initialGrouping: [],
    showToolbarControls: false,
    activeRowId: undefined,
    onExport: fn()
  }
} satisfies Meta<typeof DataTableStoryShell>

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
    rows: []
  }
}

export const GroupedByStatus: Story = {
  args: {
    initialGrouping: ["status"]
  }
}

export const WithToolbarControls: Story = {
  args: {
    showToolbarControls: true
  }
}

export const ActiveRow: Story = {
  args: {
    activeRowId: "finding-003"
  }
}

export const DarkSurface: Story = {
  args: {
    showToolbarControls: true,
    activeRowId: "finding-003"
  },
  render: (args) => (
    <div className="dark rounded-2xl bg-background p-6">
      <DataTableStoryShell {...args} />
    </div>
  )
}
