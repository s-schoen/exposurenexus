import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CSSProperties, ReactNode } from "react";

vi.mock("@/components/ui/chart.tsx", () => ({
  ChartContainer: ({
    children,
    className,
    style,
  }: {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <div data-testid="chart-container" className={className} style={style}>
      {children}
    </div>
  ),
  ChartTooltip: () => <div data-testid="chart-tooltip" />,
  ChartTooltipContent: () => <div data-testid="chart-tooltip-content" />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("recharts", () => ({
  // Draws one bar per data item through the chart's shape, like Recharts does.
  Bar: ({
    children,
    shape,
  }: {
    children?: ReactNode;
    shape?: (props: { payload: (typeof chartData)[number] }) => ReactNode;
  }) => (
    <div data-testid="bar">
      {shape && chartData.map((payload) => <div key={payload.label}>{shape({ payload })}</div>)}
      {children}
    </div>
  ),
  BarChart: ({ children }: { children?: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  LabelList: () => <div data-testid="label-list" />,
  Rectangle: () => <div data-testid="rectangle" />,
  XAxis: ({ tickFormatter }: { tickFormatter?: (value: string) => ReactNode }) => (
    <div data-testid="x-axis">{tickFormatter?.("active")}</div>
  ),
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: string) => ReactNode }) => (
    <div data-testid="y-axis">{tickFormatter?.("active")}</div>
  ),
}));

const chartData = [
  {
    label: "active",
    value: 4,
    fill: "var(--color-active)",
  },
];
const chartConfig = {
  value: {
    label: "Findings",
  },
  active: {
    label: "Active",
    color: "var(--color-active)",
  },
};

async function renderChart(height?: CSSProperties["height"]) {
  const { SimpleBarChart } = await import("@/components/chart/simple-bar-chart.tsx");

  render(
    <SimpleBarChart
      chartData={chartData}
      chartConfig={chartConfig}
      height={height}
      emptyMessage="No findings yet."
    />,
  );

  return screen.getByTestId("chart-container");
}

describe("SimpleBarChart", () => {
  it("passes an explicit height through a CSS custom property", async () => {
    const chartContainer = await renderChart("24rem");

    expect(chartContainer.style.getPropertyValue("--chart-height")).toBe("24rem");
    expect(chartContainer.className).toBe("h-(--chart-height) w-full");
  });

  it("converts a numeric height to pixels", async () => {
    const chartContainer = await renderChart(320);

    expect(chartContainer.style.getPropertyValue("--chart-height")).toBe("320px");
  });

  it("does not set an explicit height when none is provided", async () => {
    const chartContainer = await renderChart();

    expect(chartContainer.style.getPropertyValue("--chart-height")).toBe("");
    expect(chartContainer.className).toBe("w-full");
  });

  it("uses the configured label for the x-axis", async () => {
    await renderChart();

    expect(screen.getByTestId("x-axis")).toHaveTextContent("Active");
  });

  it("uses the configured label for the y-axis of horizontal bars", async () => {
    const { SimpleBarChart } = await import("@/components/chart/simple-bar-chart.tsx");

    render(
      <SimpleBarChart
        chartData={chartData}
        chartConfig={chartConfig}
        orientation="horizontal"
        emptyMessage="No findings yet."
      />,
    );

    expect(screen.getByTestId("y-axis")).toHaveTextContent("Active");
    expect(screen.getByTestId("x-axis")).toBeEmptyDOMElement();
  });

  it("hides the chart and axes while loading", async () => {
    const { SimpleBarChart } = await import("@/components/chart/simple-bar-chart.tsx");

    const { container } = render(
      <SimpleBarChart
        chartData={chartData}
        chartConfig={chartConfig}
        loading={true}
        emptyMessage="No findings yet."
      />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(screen.queryByTestId("chart-container")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("x-axis")).not.toBeInTheDocument();
  });

  it("shows the empty message instead of bare axes when no bar has a value", async () => {
    const { SimpleBarChart } = await import("@/components/chart/simple-bar-chart.tsx");

    render(
      <SimpleBarChart
        chartData={[{ ...chartData[0], value: 0 }]}
        chartConfig={chartConfig}
        height="18rem"
        emptyMessage="No findings yet."
      />,
    );

    expect(screen.getByText("No findings yet.").style.getPropertyValue("--chart-height")).toBe(
      "18rem",
    );
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("links each bar to its href, named by its label and value", async () => {
    const { SimpleBarChart } = await import("@/components/chart/simple-bar-chart.tsx");

    render(
      <SimpleBarChart
        chartData={chartData}
        chartConfig={chartConfig}
        emptyMessage="No findings yet."
        getHref={(label) => `/findings?status=${label}`}
      />,
    );

    expect(screen.getByRole("link", { name: "Active: 4" })).toHaveAttribute(
      "href",
      "/findings?status=active",
    );
  });

  it("draws plain bars without an href", async () => {
    await renderChart();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
