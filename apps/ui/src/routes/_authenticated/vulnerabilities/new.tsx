import { createFileRoute } from "@tanstack/react-router"
import { CreateVulnerabilityRouteComponent } from "@/routes/_authenticated/vulnerabilities/-new-route-component.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/new")({
  component: CreateVulnerabilityRouteComponent
})
