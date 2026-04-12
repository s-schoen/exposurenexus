import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { usePageMeta } from "@/context/page.tsx"
import { createFindingStatsQueryOptions } from "@/api/finding.ts"
import { FindingSeverityChart } from "@/components/finding-severity-chart.tsx"
import { FindingStatusChart } from "@/components/finding-status-chart.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: App
})

function App() {
  usePageMeta({
    title: "Dashboard",
    description:
      "Monitor platform activity, finding trends, and current triage workload."
  })

  const { data, isPending } = useQuery(createFindingStatsQueryOptions())

  return (
    <div className="w-full flex gap-4">
      <FindingSeverityChart
        data={data?.severity || {}}
        loading={isPending}
        height={96}
        className="w-8/12"
      />
      <FindingStatusChart
        data={data?.status || {}}
        loading={isPending}
        height={96}
        className="w-8/12"
      />
    </div>
  )
}
