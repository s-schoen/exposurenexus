import { createFileRoute } from "@tanstack/react-router"
import { CreateCustomFieldRouteComponent } from "@/routes/_authenticated/custom-fields/-new-route-component.tsx"

export const Route = createFileRoute("/_authenticated/custom-fields/new")({
  component: CreateCustomFieldRouteComponent
})
