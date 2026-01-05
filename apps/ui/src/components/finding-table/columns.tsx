import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import type { Finding } from "@openvlp/types/model/finding"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { useQuery } from "@tanstack/react-query"
import { createAssetByIDQueryOptions } from "@/api/asset.ts"
import { Spinner } from "@/components/ui/spinner.tsx"

export const columns: ColumnDef<Finding>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    )
  },
  {
    accessorKey: "severity",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Severity" />
    ),
    cell: ({ row }) => {
      return <SeverityBadge severity={row.getValue("severity")} />
    }
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      return formatFindingStatus(row.getValue("status"))
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
  }
]
