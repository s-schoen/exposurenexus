import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart.tsx"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts"
import { severityColor } from "@/lib/colors.ts"
import { formatSeverity } from "@/lib/format.ts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { useMemo } from "react"
import { cn } from "@/lib/utils.ts"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

interface FindingSeverityChartProps {
  data: Record<VulnerabilitySeverity, number> | {}
  loading?: boolean
  className?: string
}

export function FindingSeverityChartBAK({
  data,
  loading,
  className
}: FindingSeverityChartProps) {
  const chartData = useMemo(
    () =>
      Object.entries(data).map(([severity, value]) => {
        return {
          severity,
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
      color: `var(--color-${severityColor(VulnerabilitySeverity.Info, false)})`
    },
    [VulnerabilitySeverity.Low]: {
      label: formatSeverity(VulnerabilitySeverity.Low),
      color: `var(--color-${severityColor(VulnerabilitySeverity.Low, false)})`
    },
    [VulnerabilitySeverity.Medium]: {
      label: formatSeverity(VulnerabilitySeverity.Medium),
      color: `var(--color-${severityColor(VulnerabilitySeverity.Medium, false)})`
    },
    [VulnerabilitySeverity.High]: {
      label: formatSeverity(VulnerabilitySeverity.High),
      color: `var(--color-${severityColor(VulnerabilitySeverity.High, false)})`
    },
    [VulnerabilitySeverity.Critical]: {
      label: formatSeverity(VulnerabilitySeverity.Critical),
      color: `var(--color-${severityColor(VulnerabilitySeverity.Info, false)})`
    }
  } satisfies ChartConfig

  function skeletonChart() {
    return <Skeleton className="w-full h-32" />
  }

  function chart() {
    return (
      <ChartContainer config={chartConfig} className="w-full">
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="severity"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            tickFormatter={(value) =>
              chartConfig[value as keyof typeof chartConfig]?.label
            }
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel />}
          />
          <Bar dataKey="value" radius={4}>
            <LabelList
              position="top"
              offset={12}
              className="fill-foreground"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    )
  }

  return (
    <Card className={cn("aspect-auto", className)}>
      <CardHeader>
        <CardTitle>Findings by Severity</CardTitle>
      </CardHeader>
      <CardContent>{loading ? skeletonChart() : chart()}</CardContent>
    </Card>
  )
}
