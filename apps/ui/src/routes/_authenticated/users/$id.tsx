import { useMemo } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  useMatchRoute,
  useNavigate
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Pencil } from "lucide-react"
import { createUserByIDQueryOptions } from "@/api/user.ts"
import { UserDetailContent } from "@/components/user-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_authenticated/users/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  const matchRoute = useMatchRoute()
  const isEditRoute = Boolean(
    matchRoute({ to: "/users/$id/edit", params: { id } })
  )

  if (isEditRoute) {
    return <Outlet />
  }

  return <UserDetailPage id={id} />
}

function UserDetailPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const user = useQuery(createUserByIDQueryOptions(id))
  const actions = useMemo(
    () => [
      {
        label: "Edit user",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/users/$id/edit",
            params: { id }
          })
        }
      }
    ],
    [id, navigate]
  )

  usePageMeta({
    title: user.data?.displayName ?? "User",
    description:
      "Review account identity fields, status, and role assignments.",
    actions
  })

  return (
    <UserDetailContent
      userId={id}
      titleAction={
        <Link
          to="/users"
          search={{ selected: undefined }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to users
        </Link>
      }
    />
  )
}
