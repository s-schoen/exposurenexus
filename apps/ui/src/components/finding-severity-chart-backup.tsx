import { FindingSeverity } from "@openvlp/types/model/finding"
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

interface FindingSeverityChartProps {
  data: Record<FindingSeverity, number> | {}
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
