import { Outlet, useMatchRoute } from "@tanstack/react-router"
import { VulnerabilityDetailRouteComponent } from "@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx"

interface VulnerabilityIdRouteComponentProps {
  vulnerabilityId: string
}

export function VulnerabilityIdRouteComponent({
  vulnerabilityId
}: VulnerabilityIdRouteComponentProps) {
  const matchRoute = useMatchRoute()
  const isEditRoute = Boolean(
    matchRoute({
      to: "/vulnerabilities/$id/edit",
      params: { id: vulnerabilityId }
    })
  )

  if (isEditRoute) {
    return <Outlet />
  }

  return <VulnerabilityDetailRouteComponent vulnerabilityId={vulnerabilityId} />
}
