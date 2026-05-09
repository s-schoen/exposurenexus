import { createFileRoute } from "@tanstack/react-router"
import { EditVulnerabilityRouteComponent } from "@/routes/_authenticated/vulnerabilities/-edit-route-component.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id/edit")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <EditVulnerabilityRouteComponent vulnerabilityId={id} />
}
