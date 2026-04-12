import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { FindingStatus } from "@openvlp/types/model/finding"
import { FindingTable } from "@/components/finding-table"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/findings/triage")({
  component: RouteComponent
})

function RouteComponent() {
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsString).withDefault([])
  )

  useEffect(() => {
    if (status.length === 0) {
      setStatus([FindingStatus.Active])
    }
  }, [setStatus, status])

  usePageMeta({
    title: "Triage Queue",
    description:
      "Work through active findings in a queue optimized for repetitive triage."
  })

  return (
    <div className="flex flex-col gap-4">
      <FindingTable initialGrouping={["assetId"]} />
    </div>
  )
}
