import { createFileRoute } from "@tanstack/react-router"
import { EditUserRouteComponent } from "@/routes/_authenticated/users/-edit-route-component.tsx"

export const Route = createFileRoute("/_authenticated/users/$id/edit")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <EditUserRouteComponent userId={id} />
}
