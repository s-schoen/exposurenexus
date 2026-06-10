import { createFileRoute } from "@tanstack/react-router"
import { EditCustomFieldRouteComponent } from "@/routes/_authenticated/custom-fields/-edit-route-component.tsx"

export const Route = createFileRoute("/_authenticated/custom-fields/$id/edit")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <EditCustomFieldRouteComponent customFieldId={id} />
}
