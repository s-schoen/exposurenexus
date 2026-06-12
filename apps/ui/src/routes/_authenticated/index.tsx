import { createFileRoute } from "@tanstack/react-router"
import { DashboardPage } from "@/features/dashboard/components/dashboard-page.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: RouteComponent
})

function RouteComponent() {
  return <DashboardPage />
}
