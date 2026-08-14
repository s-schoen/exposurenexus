import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("recharts", () => ({
  Bar: ({ children }: { children?: ReactNode }) => <div data-testid="bar">{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  LabelList: () => <div data-testid="label-list" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
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

  render(<SimpleBarChart chartData={chartData} chartConfig={chartConfig} height={height} />);

  return screen.getByTestId("chart-container");
}

afterEach(() => {
  cleanup();
});

describe("SimpleBarChart", () => {
  it("uses an explicit CSS height without dynamic Tailwind classes", async () => {
    const chartContainer = await renderChart("24rem");

    expect(chartContainer.style.height).toBe("24rem");
    expect(chartContainer.className).toBe("w-full");
    expect(chartContainer.className).not.toContain("h-96");
  });

  it("does not set an explicit height when none is provided", async () => {
    const chartContainer = await renderChart();

    expect(chartContainer.style.height).toBe("");
    expect(chartContainer.className).toBe("w-full");
  });
});
