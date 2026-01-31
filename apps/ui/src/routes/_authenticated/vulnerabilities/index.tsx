import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  component: RouteComponent
})

function RouteComponent() {
  const page = usePage()
  page.setTitle("Vulnerabilities")

  return (
    <div>
      <VulnerabilityTable />
    </div>
  )
}
