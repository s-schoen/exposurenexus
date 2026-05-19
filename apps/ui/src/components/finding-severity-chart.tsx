import { useMemo } from "react"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { ChartConfig } from "@/components/ui/chart.tsx"
import { severityChartColor } from "@/lib/colors.ts"
import { formatSeverity } from "@/lib/format.ts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils.ts"
import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx"

interface FindingSeverityChartProps {
  data: Record<VulnerabilitySeverity, number> | {}
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
    [VulnerabilitySeverity.Info]: {
      label: formatSeverity(VulnerabilitySeverity.Info),
      color: severityChartColor(VulnerabilitySeverity.Info)
    },
    [VulnerabilitySeverity.Low]: {
      label: formatSeverity(VulnerabilitySeverity.Low),
      color: severityChartColor(VulnerabilitySeverity.Low)
    },
    [VulnerabilitySeverity.Medium]: {
      label: formatSeverity(VulnerabilitySeverity.Medium),
      color: severityChartColor(VulnerabilitySeverity.Medium)
    },
    [VulnerabilitySeverity.High]: {
      label: formatSeverity(VulnerabilitySeverity.High),
      color: severityChartColor(VulnerabilitySeverity.High)
    },
    [VulnerabilitySeverity.Critical]: {
      label: formatSeverity(VulnerabilitySeverity.Critical),
      color: severityChartColor(VulnerabilitySeverity.Critical)
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
