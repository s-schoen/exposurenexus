import { FindingStatus } from "@exposurenexus/types/model/finding"
import { useMemo } from "react"
import type { ChartConfig } from "@/components/ui/chart.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils.ts"
import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx"

interface FindingStatusChartProps {
  data: Record<FindingStatus, number> | {}
  loading?: boolean
  className?: string
  height?: number
}

export function FindingStatusChart({
  data,
  loading,
  className,
  height
}: FindingStatusChartProps) {
  const chartData = useMemo(
    () =>
      Object.entries(data).map(([status, value]) => {
        return {
          label: status,
          value,
          fill: `var(--color-${status})`
        }
      }),
    [data]
  )

  const chartConfig = {
    value: {
      label: "Findings"
    },
    [FindingStatus.Active]: {
      label: formatFindingStatus(FindingStatus.Active),
      color: `var(--chart-1)`
    },
    [FindingStatus.Confirmed]: {
      label: formatFindingStatus(FindingStatus.Confirmed),
      color: `var(--chart-1)`
    },
    [FindingStatus.Mitigated]: {
      label: formatFindingStatus(FindingStatus.Mitigated),
      color: `var(--chart-1)`
    },
    [FindingStatus.Duplicate]: {
      label: formatFindingStatus(FindingStatus.Duplicate),
      color: `var(--chart-1)`
    },
    [FindingStatus.OutOfScope]: {
      label: formatFindingStatus(FindingStatus.OutOfScope),
      color: `var(--chart-1)`
    },
    [FindingStatus.RiskAccepted]: {
      label: formatFindingStatus(FindingStatus.RiskAccepted),
      color: `var(--chart-1)`
    },
    [FindingStatus.FalsePositive]: {
      label: formatFindingStatus(FindingStatus.FalsePositive),
      color: `var(--chart-1)`
    },
    [FindingStatus.Inactive]: {
      label: formatFindingStatus(FindingStatus.Inactive),
      color: `var(--chart-1)`
    }
  } satisfies ChartConfig

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Findings by Status</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleBarChart
          chartData={chartData}
          chartConfig={chartConfig}
          loading={loading}
          height={height}
        />
      </CardContent>
    </Card>
  )
}
