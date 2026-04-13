import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type { User } from "@openvlp/types/model/user"
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

interface UserTableProps {
  selectedUserId?: string
  onSelectUser?: (user: User) => void
}

export function UserTable({
  selectedUserId,
  onSelectUser
}: UserTableProps = {}) {
  const navigate = useNavigate()
  const usersQuery = useQuery(createListUsersQueryOptions())

  const handleOpenUser = async (user: User) => {
    await navigate({
      to: "/users/$id",
      params: {
        id: user.id
      }
    })
  }

  return (
    <DataTable
      columns={columns}
      query={usersQuery}
      groupingOptions={groupingOptions}
      onRowClick={onSelectUser}
      onRowDoubleClick={handleOpenUser}
      isRowActive={(user) => user.id === selectedUserId}
    />
  )
}
