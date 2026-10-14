import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { CSSProperties } from "react";
import type { RectangleProps } from "recharts";

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
  /** Shown instead of bare axes when no bar has a value. */
  emptyMessage: string;
  /** Makes each bar a link to the list or record behind it. */
  getHref?: (label: string) => string;
}

/** One muted line, centered where the chart would be. */
function ChartEmpty({ message, height }: { message: string; height?: CSSProperties["height"] }) {
  return (
    <div
      className="flex h-(--chart-height) items-center justify-center text-13 text-muted-foreground"
      style={{ "--chart-height": cssHeight(height ?? "8rem") } as CSSProperties}
    >
      {message}
    </div>
  );
}

function cssHeight(height: NonNullable<CSSProperties["height"]>) {
  return typeof height === "number" ? `${height}px` : height;
}

export function SimpleBarChart({
  chartConfig,
  chartData,
  loading = false,
  height,
  orientation = "vertical",
  emptyMessage,
  getHref,
}: SimpleBarChartProps) {
  function skeleton() {
    return <Skeleton className="w-full h-32" />;
  }

  function formatLabel(value: string) {
    return chartConfig[value].label as string;
  }

  function linkedBar({ payload, ...props }: RectangleProps & { payload?: ChartData }) {
    if (!getHref || !payload) {
      return <Rectangle {...props} />;
    }

    return (
      <Link
        to={getHref(payload.label)}
        aria-label={`${formatLabel(payload.label)}: ${payload.value}`}
        className="outline-none hover:opacity-80 focus-visible:opacity-80"
      >
        <Rectangle {...props} />
      </Link>
    );
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
            : ({ "--chart-height": cssHeight(height) } as CSSProperties)
        }
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          layout={orientation === "horizontal" ? "vertical" : "horizontal"}
        >
          {axes()}
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" radius={4} shape={getHref ? linkedBar : undefined}>
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

  if (loading) {
    return skeleton();
  }

  return chartData.some((entry) => entry.value > 0) ? (
    chart()
  ) : (
    <ChartEmpty message={emptyMessage} height={height} />
  );
}
