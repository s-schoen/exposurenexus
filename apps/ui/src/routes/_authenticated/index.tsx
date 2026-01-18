import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { useQuery } from "@tanstack/react-query"
import { createFindingStatsQueryOptions } from "@/api/finding.ts"
import { FindingSeverityChart } from "@/components/finding-severity-chart.tsx"
import { FindingStatusChart } from "@/components/finding-status-chart.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: App
})

function App() {
  const page = usePage()
  page.setTitle("Dashboard")

  const { data, isPending } = useQuery(createFindingStatsQueryOptions())

  return (
    <div className="w-full flex gap-4">
      <FindingSeverityChart
        data={data?.severity || {}}
        loading={isPending}
        height={96}
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
