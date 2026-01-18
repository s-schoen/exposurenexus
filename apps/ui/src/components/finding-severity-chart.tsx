import { FindingSeverity } from "@openvlp/types/model/finding"
import { type ChartConfig } from "@/components/ui/chart.tsx"
import { severityColor } from "@/lib/colors.ts"
import { formatSeverity } from "@/lib/format.ts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { useMemo } from "react"
import { cn } from "@/lib/utils.ts"
import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx"

interface FindingSeverityChartProps {
  data: Record<FindingSeverity, number> | {}
  loading?: boolean
  className?: string
  height?: number
}

export function FindingSeverityChart({
  data,
  loading,
  className,
  height
}: FindingSeverityChartProps) {
  const chartData = useMemo(
    () =>
      Object.entries(data).map(([severity, value]) => {
        return {
          label: severity,
          value,
          fill: `var(--color-${severity})`
        }
      }),
    [data]
  )

  const chartConfig = {
    value: {
      label: "Findings"
    },
    [FindingSeverity.Info]: {
      label: formatSeverity(FindingSeverity.Info),
      color: `var(--color-${severityColor(FindingSeverity.Info, false)})`
    },
    [FindingSeverity.Low]: {
      label: formatSeverity(FindingSeverity.Low),
      color: `var(--color-${severityColor(FindingSeverity.Low, false)})`
    },
    [FindingSeverity.Medium]: {
      label: formatSeverity(FindingSeverity.Medium),
      color: `var(--color-${severityColor(FindingSeverity.Medium, false)})`
    },
    [FindingSeverity.High]: {
      label: formatSeverity(FindingSeverity.High),
      color: `var(--color-${severityColor(FindingSeverity.High, false)})`
    },
    [FindingSeverity.Critical]: {
      label: formatSeverity(FindingSeverity.Critical),
      color: `var(--color-${severityColor(FindingSeverity.Info, false)})`
    }
  } satisfies ChartConfig

  return (
    <Card className={cn("aspect-auto", className)}>
      <CardHeader>
        <CardTitle>Findings by Severity</CardTitle>
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
