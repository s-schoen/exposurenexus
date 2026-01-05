import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import type { Finding } from "@openvlp/types/model/finding"
import { SeverityBadge } from "@/components/severity-badge.tsx"

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
  }
]
