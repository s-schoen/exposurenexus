import { createFileRoute } from "@tanstack/react-router"
import { CreateRoleRouteComponent } from "@/routes/_authenticated/roles/-new-route-component.tsx"

export const Route = createFileRoute("/_authenticated/roles/new")({
  component: CreateRoleRouteComponent
})
