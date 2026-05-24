import { createFileRoute } from "@tanstack/react-router"
import { FindingDetailRouteComponent } from "@/routes/_authenticated/findings/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <FindingDetailRouteComponent findingId={id} />
}
