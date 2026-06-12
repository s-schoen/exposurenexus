import {
  Outlet,
  createFileRoute,
  useMatchRoute
} from "@tanstack/react-router"
import { CustomFieldDetailPage } from "@/features/custom-fields/components/custom-field-detail-page.tsx"

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

  return <CustomFieldDetailPage customFieldId={id} />
}
