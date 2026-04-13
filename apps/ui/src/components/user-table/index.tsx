import { useQuery } from "@tanstack/react-query"
import type { GroupingOption } from "@/components/data-table/types.ts"
import { DataTable } from "@/components/data-table/data-table.tsx"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { columns } from "@/components/user-table/columns.tsx"

const groupingOptions: Array<GroupingOption> = [
  {
    id: "emailVerified",
    label: "Status",
    formatValue: (value) => (value ? "Verified" : "Unverified")
  }
]

export function UserTable() {
  const usersQuery = useQuery(createListUsersQueryOptions())

  return (
    <DataTable
      columns={columns}
      query={usersQuery}
      groupingOptions={groupingOptions}
    />
  )
}
