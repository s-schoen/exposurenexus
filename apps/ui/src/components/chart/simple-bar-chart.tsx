import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { CSSProperties } from "react";

interface ChartData {
  label: string;
  value: number;
  fill?: string;
}

interface SimpleBarChartProps {
  chartData: Array<ChartData>;
  chartConfig: ChartConfig;
  loading?: boolean;
  height?: CSSProperties["height"];
  // Horizontal bars give every category label its own row, for charts with many or long labels.
  orientation?: "vertical" | "horizontal";
}

export function SimpleBarChart({
  chartConfig,
  chartData,
  loading = false,
  height,
  orientation = "vertical",
}: SimpleBarChartProps) {
  function skeleton() {
    return <Skeleton className="w-full h-32" />;
  }

  function formatLabel(value: string) {
    return chartConfig[value].label as string;
  }

  function axes() {
    if (orientation === "horizontal") {
      return (
        <>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width="auto"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            tickFormatter={formatLabel}
          />
        </>
      );
    }

    return (
      <>
        <CartesianGrid vertical={false} />
        <YAxis allowDecimals={false} tickLine={false} tickMargin={8} axisLine={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          tickMargin={8}
          axisLine={false}
          tickFormatter={formatLabel}
        />
      </>
    );
  }

  function chart() {
    return (
      <ChartContainer
        config={chartConfig}
        className={height === undefined ? "w-full" : "h-(--chart-height) w-full"}
        style={
          height === undefined
            ? undefined
            : ({
                "--chart-height": typeof height === "number" ? `${height}px` : height,
              } as CSSProperties)
        }
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          layout={orientation === "horizontal" ? "vertical" : "horizontal"}
        >
          {axes()}
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" radius={4}>
            <LabelList
              position={orientation === "horizontal" ? "right" : "top"}
              offset={orientation === "horizontal" ? 8 : 12}
              className="fill-foreground"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  }

  return loading ? skeleton() : chart();
}
