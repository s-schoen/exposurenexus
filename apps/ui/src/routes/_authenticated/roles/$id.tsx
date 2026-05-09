import {
  Outlet,
  createFileRoute,
  useMatchRoute
} from "@tanstack/react-router"
import { RoleDetailRouteComponent } from "@/routes/_authenticated/roles/-detail-route-component.tsx"

export const Route = createFileRoute("/_authenticated/roles/$id")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const matchRoute = useMatchRoute()
  const isEditRoute = Boolean(
    matchRoute({ to: "/roles/$id/edit", params: { id } })
  )

  if (isEditRoute) {
    return <Outlet />
  }

  return <RoleDetailRouteComponent roleId={id} />
}
