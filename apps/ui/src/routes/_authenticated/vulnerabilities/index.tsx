import { createFileRoute } from "@tanstack/react-router"
import { VulnerabilitiesRouteComponent } from "@/routes/_authenticated/vulnerabilities/-index-route-component.tsx"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const { selected } = Route.useSearch()

  return <VulnerabilitiesRouteComponent selected={selected} />
}
