import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
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
  const user = useQuery(createUserByIDQueryOptions(id))

  usePageMeta({
    title: user.data?.name ?? "User",
    description:
      "Review account identity fields, verification state, and audit timestamps."
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
