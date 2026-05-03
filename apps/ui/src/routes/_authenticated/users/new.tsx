import { createFileRoute } from "@tanstack/react-router"
import { CreateUserRouteComponent } from "@/routes/_authenticated/users/-new-route-component.tsx"

export const Route = createFileRoute("/_authenticated/users/new")({
  component: CreateUserRouteComponent
})
