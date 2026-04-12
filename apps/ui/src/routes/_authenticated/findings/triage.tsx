import { useEffect } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { FindingStatus } from "@openvlp/types/model/finding"
import { ArrowRight } from "lucide-react"
import { FindingTable } from "@/components/finding-table"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
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
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Triage queue
            </CardTitle>
            <CardDescription>
              Starts with active findings only, grouped by asset and sorted by
              severity and most recent observation.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            render={
              <Link to="/findings">
                Full findings view
                <ArrowRight />
              </Link>
            }
          />
        </CardHeader>
      </Card>
      <FindingTable initialGrouping={["assetId"]} />
    </div>
  )
}
