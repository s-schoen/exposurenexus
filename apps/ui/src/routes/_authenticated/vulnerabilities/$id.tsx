import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilityIdRouteComponent } from "@/routes/_authenticated/vulnerabilities/-id-route-component.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <VulnerabilityIdRouteComponent vulnerabilityId={id} />
}
