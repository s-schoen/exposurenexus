import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/components/finding-severity-chart.stories";

import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { CSSProperties } from "react";

interface ChartDataItem {
  label: string;
  value: number;
}

vi.mock("@/components/chart/simple-bar-chart.tsx", () => ({
  SimpleBarChart: ({
    chartConfig,
    chartData,
    loading,
  }: {
    chartConfig: ChartConfig;
    chartData: Array<ChartDataItem>;
    height?: CSSProperties["height"];
    loading?: boolean;
  }) => (
    <div aria-label="severity chart">
      {loading ? <div data-slot="skeleton" /> : null}
      {!loading
        ? chartData.map((item) => (
            <div key={item.label}>
              {String(chartConfig[item.label].label)}: {item.value}
            </div>
          ))
        : null}
    </div>
  ),
}));

const { Default, EmptyState, Loading } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("FindingSeverityChart stories", () => {
  it("renders severity chart labels and values", () => {
    render(<Default />);

    expect(screen.getByText("Findings by Severity")).toBeVisible();
    expect(screen.getByText(/Info:\s*8/)).toBeVisible();
    expect(screen.getByText(/High:\s*15/)).toBeVisible();
    expect(screen.getByText(/Critical:\s*4/)).toBeVisible();
  });

  it("renders a loading chart placeholder", () => {
    const { container } = render(<Loading />);

    expect(screen.getByText("Findings by Severity")).toBeVisible();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByText("Info: 8")).not.toBeInTheDocument();
  });

  it("renders the chart shell for empty severity data", () => {
    render(<EmptyState />);

    expect(screen.getByText("Findings by Severity")).toBeVisible();
    expect(screen.queryByText(/: \d+$/)).not.toBeInTheDocument();
  });
});
