import type { ColumnDef } from "@tanstack/react-table"
import type { Asset } from "@openvlp/types/model/asset"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"

import { capitalizeFirstLetter } from "@/lib/format.ts"

export const columns: ColumnDef<Asset>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    )
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      return <span>{capitalizeFirstLetter(row.getValue("type"))}</span>
    }
  }
]
