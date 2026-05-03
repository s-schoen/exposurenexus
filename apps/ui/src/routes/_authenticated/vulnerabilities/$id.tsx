import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilityDetailRouteComponent } from "@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <VulnerabilityDetailRouteComponent vulnerabilityId={id} />
}
