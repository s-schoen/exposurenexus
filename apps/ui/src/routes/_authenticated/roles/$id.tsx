import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { createRoleByIDQueryOptions } from "@/api/role.ts"
import { RoleDetailContent } from "@/components/role-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_authenticated/roles/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const role = useQuery(createRoleByIDQueryOptions(id))

  usePageMeta({
    title: role.data?.name ?? "Role",
    description:
      "Inspect the selected role and review how its permissions map to protected resources."
  })

  return (
    <RoleDetailContent
      roleId={id}
      titleAction={
        <Link
          to="/roles"
          search={{ selected: undefined }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to roles
        </Link>
      }
    />
  )
}
