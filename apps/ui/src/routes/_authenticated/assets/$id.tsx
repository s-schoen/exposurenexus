import { createFileRoute } from "@tanstack/react-router"
import { AssetDetailRouteComponent } from "@/routes/_authenticated/assets/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/assets/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()

  return <AssetDetailRouteComponent assetId={id} />
}
