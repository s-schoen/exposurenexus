import { createFileRoute } from "@tanstack/react-router"
import { usePageMeta } from "@/context/page.tsx"
import { FindingTable } from "@/components/finding-table"

export const Route = createFileRoute("/_authenticated/findings/")({
  component: RouteComponent
})

function RouteComponent() {
  usePageMeta({
    title: "Findings",
    description:
      "Track active issues, ownership, severity, and remediation status across assets."
  })

  return (
    <div>
      <FindingTable />
    </div>
  )
}
