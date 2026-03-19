import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts"
import type { ChartConfig } from "@/components/ui/chart.tsx"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { cn } from "@/lib/utils.ts"

interface ChartData {
  label: string
  value: number
  fill?: string
}

interface SimpleBarChartProps {
  chartData: Array<ChartData>
  chartConfig: ChartConfig
  loading?: boolean
  height?: number
}

export function SimpleBarChart({
  chartConfig,
  chartData,
  loading = false,
  height
}: SimpleBarChartProps) {
  function skeleton() {
    return <Skeleton className="w-full h-32" />
  }

  function chart() {
    return (
      <ChartContainer
        config={chartConfig}
        className={cn(height ? `h-${height}` : undefined, "w-full")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <YAxis tickLine={false} tickMargin={8} axisLine={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              tickFormatter={(value) =>
                chartConfig[value as keyof typeof chartConfig].label as string
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
        </ResponsiveContainer>
      </ChartContainer>
    )
  }

  return loading ? skeleton() : chart()
}
