import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { FindingTable } from "@/components/finding-table"

export const Route = createFileRoute("/_authenticated/findings/")({
  component: RouteComponent
})

function RouteComponent() {
  const page = usePage()
  page.setTitle("Findings")

  return (
    <div>
      <FindingTable />
    </div>
  )
}
