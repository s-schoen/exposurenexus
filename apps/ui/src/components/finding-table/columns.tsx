import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import { type Finding, FindingStatus } from "@openvlp/types/model/finding"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { useQuery } from "@tanstack/react-query"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { Spinner } from "@/components/ui/spinner.tsx"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import { Timestamp } from "@/components/timestamp.tsx"

export const columns: ColumnDef<Finding>[] = [
  {
    accessorKey: "vulnerability.title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    enableColumnFilter: false
  },
  {
    accessorKey: "severity",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Severity" />
    ),
    cell: ({ row }) => {
      return <SeverityBadge severity={row.getValue("severity")} />
    },
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (filterValue === undefined || filterValue.length === 0) return true
      return filterValue.includes(row.getValue("severity"))
    },
    meta: {
      label: "Severity",
      filterVariant: "select",
      options: Object.keys(VulnerabilitySeverity).map((severity) => ({
        label: severity,
        value:
          VulnerabilitySeverity[severity as keyof typeof VulnerabilitySeverity]
      }))
    }
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      return formatFindingStatus(row.getValue("status"))
    },
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (filterValue === undefined || filterValue.length === 0) return true
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
      const asset = useQuery(
        createAssetByIDQueryOptions(row.getValue("assetId"))
      )

      return <div>{asset.isPending ? <Spinner /> : asset.data?.name}</div>
    }
  },
  {
    accessorKey: "source",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    )
  },
  {
    accessorKey: "firstSeen",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="First Seen" />
    ),
    cell: ({ row }) => {
      return <Timestamp timestamp={new Date(row.getValue("firstSeen"))} />
    }
  },
  {
    accessorKey: "lastSeen",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Seen" />
    ),
    cell: ({ row }) => {
      return <Timestamp timestamp={new Date(row.getValue("lastSeen"))} />
    }
  }
]
