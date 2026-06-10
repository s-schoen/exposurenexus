import {
  Outlet,
  createFileRoute,
  useMatchRoute
} from "@tanstack/react-router"
import { CustomFieldDetailRouteComponent } from "@/routes/_authenticated/custom-fields/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/custom-fields/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const matchRoute = useMatchRoute()
  const isEditRoute = Boolean(
    matchRoute({ to: "/custom-fields/$id/edit", params: { id } })
  )

  if (isEditRoute) {
    return <Outlet />
  }

  return <CustomFieldDetailRouteComponent customFieldId={id} />
}
