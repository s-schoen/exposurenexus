import type { ColumnDef } from "@tanstack/react-table"
import type { User } from "@openvlp/types/model/user"
import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx"
import { Timestamp } from "@/components/timestamp.tsx"
import { Badge } from "@/components/ui/badge.tsx"

export const columns: Array<ColumnDef<User>> = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    )
  },
  {
    id: "username",
    accessorFn: (user) => user.displayUsername ?? user.username ?? "",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Username" />
    ),
    cell: ({ row }) => {
      const username = row.original.displayUsername ?? row.original.username

      return username ? (
        <span>{username}</span>
      ) : (
        <span className="text-muted-foreground">No username</span>
      )
    }
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    )
  },
  {
    accessorKey: "emailVerified",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const isVerified = row.getValue<boolean>("emailVerified")

      return (
        <Badge
          variant="outline"
          className={
            isVerified
              ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
              : "rounded-full border-amber-200 bg-amber-50 text-amber-700"
          }
        >
          {isVerified ? "Verified" : "Unverified"}
        </Badge>
      )
    },
    filterFn: (row, _columnId, filterValue: Array<string>) => {
      if (filterValue.length === 0) return true

      return filterValue.includes(String(row.getValue("emailVerified")))
    },
    meta: {
      label: "Status",
      filterVariant: "select",
      options: [
        { label: "Verified", value: "true" },
        { label: "Unverified", value: "false" }
      ]
    }
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => <Timestamp timestamp={row.getValue("createdAt")} />
  }
]
