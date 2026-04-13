import { createFileRoute } from "@tanstack/react-router"
import { UserTable } from "@/components/user-table"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/users/")({
  component: RouteComponent
})

function RouteComponent() {
  usePageMeta({
    title: "Users",
    description: "Browse users with access to the platform."
  })

  return <UserTable />
}
