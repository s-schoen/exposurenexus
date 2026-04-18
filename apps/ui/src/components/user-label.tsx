import { useQuery } from "@tanstack/react-query"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils"

interface UserLabelProps {
  userId: string
  className?: string
}

export function UserLabel({ userId, className }: UserLabelProps) {
  const displayName = useQuery({
    ...createListUsersQueryOptions(),
    enabled: Boolean(userId),
    select: (users) => users.find((user) => user.id === userId)?.displayUsername ?? ""
  })

  if (!userId) {
    return <span className={className} />
  }

  if (displayName.isPending) {
    return <Skeleton className={cn("inline-flex h-4 w-24", className)} />
  }

  return <span className={className}>{displayName.data ?? ""}</span>
}
