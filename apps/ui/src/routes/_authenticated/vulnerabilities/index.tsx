import { createFileRoute } from "@tanstack/react-router"
import { usePageMeta } from "@/context/page.tsx"
import { VulnerabilityTable } from "@/components/vulnerability-table"

export const Route = createFileRoute("/_authenticated/vulnerabilities/")({
  component: RouteComponent
})

function RouteComponent() {
  usePageMeta({
    title: "Vulnerabilities",
    description:
      "Browse the underlying vulnerability catalog and inspect severity classification."
  })

  return (
    <div>
      <VulnerabilityTable />
    </div>
  )
}
