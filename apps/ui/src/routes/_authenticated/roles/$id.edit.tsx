import { createFileRoute } from "@tanstack/react-router"
import { EditRoleRouteComponent } from "@/routes/_authenticated/roles/-edit-route-component.tsx"

export const Route = createFileRoute("/_authenticated/roles/$id/edit")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <EditRoleRouteComponent roleId={id} />
}
