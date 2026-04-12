import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { Finding } from "@openvlp/types/model/finding"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import { SEVERITY_ORDER } from "@/components/finding-table/constants.ts"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { formatFindingStatus } from "@/lib/format.ts"

const severityRank = new Map(
  [...SEVERITY_ORDER].reverse().map((severity, index) => [severity, index])
)

function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return (
    <Badge variant="outline" className="rounded-full bg-background px-2.5">
      {formatFindingStatus(status)}
    </Badge>
  )
}

function getDateTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return 0
  }

  return new Date(value).getTime()
}

function compareDateValues(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined
) {
  return getDateTimestamp(left) - getDateTimestamp(right)
}

function FindingDateCell({
  value
}: {
  value: Date | string | null | undefined
}) {
  if (!value) {
    return <span className="text-muted-foreground">Not available</span>
  }

  const date = new Date(value)

  return (
    <span className="whitespace-nowrap font-medium text-foreground">
      {date.toLocaleString()}
    </span>
  )
}

export function createFindingColumns(
  assetNamesById: ReadonlyMap<string, string>
): Array<ColumnDef<Finding>> {
  return [
    {
      accessorKey: "vulnerability.title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <div className="min-w-0 py-0.5">
          <div className="truncate font-medium text-foreground">
            {row.original.vulnerability.title}
          </div>
        </div>
      ),
      enableColumnFilter: false
    },
    {
      accessorKey: "severity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Severity" />
      ),
      sortingFn: (rowA, rowB) => {
        const left = severityRank.get(rowA.original.severity) ?? -1
        const right = severityRank.get(rowB.original.severity) ?? -1

        return left - right
      },
      cell: ({ row }) => {
        return <SeverityBadge severity={row.getValue("severity")} />
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true
        return filterValue.includes(row.getValue("severity"))
      },
      meta: {
        label: "Severity",
        filterVariant: "select",
        options: Object.keys(VulnerabilitySeverity).map((severity) => ({
          label: severity,
          value:
            VulnerabilitySeverity[
              severity as keyof typeof VulnerabilitySeverity
            ]
        }))
      }
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        return <FindingStatusBadge status={row.getValue("status")} />
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true
        return filterValue.includes(row.getValue("status"))
      },
      meta: {
        label: "Status",
        filterVariant: "select",
        options: Object.keys(FindingStatus).map((status) => ({
          label: status,
          value: FindingStatus[status as keyof typeof FindingStatus]
        }))
      }
    },
    {
      accessorKey: "assetId",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Asset" />
      ),
      cell: ({ row }) => {
        const assetName = assetNamesById.get(row.original.assetId)

        return (
          <div className="min-w-0">
            <span className="truncate font-medium text-foreground">
              {assetName ?? "Unknown asset"}
            </span>
          </div>
        )
      }
    },
    {
      accessorKey: "source",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Source" />
      ),
      cell: ({ row }) => (
        <span className="inline-flex rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {row.original.source || "Manual"}
        </span>
      )
    },
    {
      accessorKey: "firstSeen",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="First Seen" />
      ),
      sortingFn: (rowA, rowB) =>
        compareDateValues(rowA.original.firstSeen, rowB.original.firstSeen),
      cell: ({ row }) => <FindingDateCell value={row.getValue("firstSeen")} />
    },
    {
      accessorKey: "lastSeen",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Seen" />
      ),
      sortingFn: (rowA, rowB) =>
        compareDateValues(rowA.original.lastSeen, rowB.original.lastSeen),
      cell: ({ row }) => <FindingDateCell value={row.getValue("lastSeen")} />
    }
  ]
}
