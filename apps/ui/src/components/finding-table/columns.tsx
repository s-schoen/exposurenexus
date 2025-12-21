import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import { capitalizeFirstLetter } from "@/lib/utils.ts"
import type { Finding } from "@openvlp/types/model/finding"

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
      return <span>{capitalizeFirstLetter(row.getValue("severity"))}</span>
    }
  }
]
