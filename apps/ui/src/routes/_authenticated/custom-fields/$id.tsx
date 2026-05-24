import { createFileRoute } from "@tanstack/react-router"
import { CustomFieldDetailRouteComponent } from "@/routes/_authenticated/custom-fields/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/custom-fields/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <CustomFieldDetailRouteComponent customFieldId={id} />
}
