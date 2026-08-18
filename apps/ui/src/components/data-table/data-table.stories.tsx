import { DatabaseBackup } from "lucide-react";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";

import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { DataTableColumnDef, GroupingOption } from "@/components/data-table/types";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UseQueryResult } from "@tanstack/react-query";

type StoryItemStatus = "active" | "review" | "complete";
type StoryItemCategory = "platform" | "product" | "operations";

interface StoryItem {
  id: string;
  title: string;
  status: StoryItemStatus;
  category: StoryItemCategory;
  owner: string;
  score: number;
  updatedAt: string;
}

interface DataTableStoryArgs {
  rows: Array<StoryItem>;
  pending?: boolean;
  embedded?: boolean;
  initialGrouping?: Array<string>;
  showToolbarControls?: boolean;
  activeRowId?: string;
  onExport?: () => void;
}

const statusLabel: Record<StoryItemStatus, string> = {
  active: "Active",
  review: "In Review",
  complete: "Complete",
};

const statusClassName: Record<StoryItemStatus, string> = {
  active:
    "rounded-full border-[oklch(0.74_0.11_32)] bg-[oklch(0.94_0.05_28)] text-[oklch(0.44_0.16_28)]",
  review:
    "rounded-full border-[oklch(0.8_0.085_72)] bg-[oklch(0.96_0.03_72)] text-[oklch(0.46_0.115_66)]",
  complete:
    "rounded-full border-[oklch(0.85_0.036_102)] bg-[oklch(0.975_0.012_102)] text-[oklch(0.45_0.045_102)]",
};

const categoryLabel: Record<StoryItemCategory, string> = {
  platform: "Platform",
  product: "Product",
  operations: "Operations",
};

const defaultRows: Array<StoryItem> = [
  {
    id: "item-001",
    title: "Prepare quarterly roadmap",
    status: "active",
    category: "product",
    owner: "Strategy",
    score: 9,
    updatedAt: "2026-04-16T08:45:00.000Z",
  },
  {
    id: "item-002",
    title: "Review service capacity plan",
    status: "review",
    category: "platform",
    owner: "Infrastructure",
    score: 7,
    updatedAt: "2026-04-15T14:20:00.000Z",
  },
  {
    id: "item-003",
    title: "Refresh support rotation",
    status: "active",
    category: "operations",
    owner: "Customer Care",
    score: 8,
    updatedAt: "2026-04-14T10:05:00.000Z",
  },
  {
    id: "item-004",
    title: "Publish design system release",
    status: "complete",
    category: "product",
    owner: "Design",
    score: 4,
    updatedAt: "2026-04-12T17:30:00.000Z",
  },
  {
    id: "item-005",
    title: "Audit vendor renewals",
    status: "review",
    category: "operations",
    owner: "Finance",
    score: 6,
    updatedAt: "2026-04-11T09:15:00.000Z",
  },
  {
    id: "item-006",
    title: "Migrate build cache",
    status: "active",
    category: "platform",
    owner: "Developer Tools",
    score: 7,
    updatedAt: "2026-04-10T12:00:00.000Z",
  },
];

const groupingOptions: Array<GroupingOption> = [
  {
    id: "status",
    label: "Status",
    formatValue: (value) => statusLabel[value as StoryItemStatus],
  },
  {
    id: "category",
    label: "Category",
    formatValue: (value) => categoryLabel[value as StoryItemCategory],
  },
];

const columns: Array<DataTableColumnDef<StoryItem>> = [
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Item" />,
    cell: ({ row }) => (
      <div className="min-w-0 py-0.5">
        <div className="truncate font-medium text-foreground">{row.original.title}</div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.getValue<StoryItemStatus>("status");

      return (
        <Badge variant="outline" className={statusClassName[status]}>
          {statusLabel[status]}
        </Badge>
      );
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) {
        return true;
      }

      return filterValue.includes(row.getValue("status"));
    },
    meta: {
      label: "Status",
      filterVariant: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "In Review", value: "review" },
        { label: "Complete", value: "complete" },
      ],
    },
  },
  {
    accessorKey: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ row }) => {
      const category = row.getValue<StoryItemCategory>("category");

      return (
        <span className="inline-flex rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {categoryLabel[category]}
        </span>
      );
    },
  },
  {
    accessorKey: "owner",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Owner" />,
    filterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue.trim()) {
        return true;
      }

      return row
        .getValue<string>("owner")
        .toLocaleLowerCase()
        .includes(filterValue.toLocaleLowerCase());
    },
    meta: {
      label: "Owner",
      filterVariant: "text",
    },
  },
  {
    accessorKey: "score",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Score" />,
    filterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue.trim()) {
        return true;
      }

      const parsedFilterValue = Number(filterValue);

      return (
        Number.isFinite(parsedFilterValue) && row.getValue<number>("score") === parsedFilterValue
      );
    },
    meta: {
      label: "Score",
      filterVariant: "number",
    },
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {new Date(row.original.updatedAt).toLocaleDateString()}
      </span>
    ),
  },
];

function createQueryResult<TData>({
  data,
  isFetching,
  isPending,
  refetch,
}: {
  data: Array<TData> | undefined;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => Promise<unknown>;
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
    refetch,
  } as unknown as UseQueryResult<Array<TData>, Error>;
}

function DataTableStoryShell({
  rows,
  pending = false,
  embedded = false,
  initialGrouping = [],
  showToolbarControls = false,
  activeRowId,
  onExport = fn(),
}: DataTableStoryArgs) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    setCurrentRows(rows);
  }, [rows]);

  const handleRefresh = async () => {
    if (pending) {
      return {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
        isSuccess: false,
        status: "pending",
      };
    }

    setIsFetching(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setIsFetching(false);

    return {
      data: currentRows,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: "success",
    };
  };

  const query = createQueryResult({
    data: pending ? undefined : currentRows,
    isFetching,
    isPending: pending,
    refetch: handleRefresh,
  });

  return (
    <div className="w-full space-y-4">
      <DataTable
        columns={columns}
        {...(embedded ? { rows: currentRows } : { query })}
        embedded={embedded}
        groupingOptions={groupingOptions}
        initialGrouping={initialGrouping}
        onRowDelete={async (selectedRows) => {
          await Promise.resolve();
          setCurrentRows((existingRows) =>
            existingRows.filter(
              (row) => !selectedRows.some((selectedRow) => selectedRow.id === row.id),
            ),
          );
        }}
        onRowClick={fn()}
        onRowDoubleClick={fn()}
        isRowActive={activeRowId ? (row) => row.id === activeRowId : undefined}
        toolbarControls={
          showToolbarControls ? (
            <Button variant="default" size="sm" className="h-9 rounded-xl" onClick={onExport}>
              <DatabaseBackup />
              Export CSV
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

const meta = {
  title: "Components/DataTable",
  component: DataTableStoryShell,
  tags: ["!test"],
  parameters: {
    layout: "padded",
  },
  args: {
    rows: defaultRows,
    pending: false,
    embedded: false,
    initialGrouping: [],
    showToolbarControls: false,
    activeRowId: undefined,
    onExport: fn(),
  },
} satisfies Meta<typeof DataTableStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: () => <DataTableStoryShell {...meta.args} pending={true} />,
};

export const Empty: Story = {
  render: () => <DataTableStoryShell {...meta.args} rows={[]} />,
};

export const GroupedByStatus: Story = {
  render: () => <DataTableStoryShell {...meta.args} initialGrouping={["status"]} />,
};

export const WithToolbarControls: Story = {
  render: () => <DataTableStoryShell {...meta.args} showToolbarControls={true} />,
};

export const ActiveRow: Story = {
  render: () => <DataTableStoryShell {...meta.args} activeRowId="item-003" />,
};

export const DarkSurface: Story = {
  render: () => (
    <div className="dark rounded-2xl bg-background p-6">
      <DataTableStoryShell {...meta.args} showToolbarControls={true} activeRowId="item-003" />
    </div>
  ),
};

export const Embedded: Story = {
  render: () => <DataTableStoryShell {...meta.args} embedded rows={defaultRows.slice(0, 2)} />,
};
