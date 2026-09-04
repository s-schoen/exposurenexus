import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/features/findings/components/finding-status-chart.stories.tsx";

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
    <div aria-label="status chart">
      {loading ? <div data-slot="skeleton" /> : null}
      {!loading
        ? chartData.map((item) => (
            <div key={item.label}>
              {chartConfig[item.label].label}: {item.value}
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

describe("FindingStatusChart stories", () => {
  it("renders status chart labels and values", () => {
    render(<Default />);

    expect(screen.getByText("Findings by Status")).toBeVisible();
    expect(screen.getByText(/Active:\s*18/)).toBeVisible();
    expect(screen.getByText(/Mitigated:\s*31/)).toBeVisible();
    expect(screen.getByText(/False Positive:\s*5/)).toBeVisible();
  });

  it("renders a loading chart placeholder", () => {
    const { container } = render(<Loading />);

    expect(screen.getByText("Findings by Status")).toBeVisible();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByText("Active: 18")).not.toBeInTheDocument();
  });

  it("renders the chart shell for empty status data", () => {
    render(<EmptyState />);

    expect(screen.getByText("Findings by Status")).toBeVisible();
    expect(screen.queryByText(/: \d+$/)).not.toBeInTheDocument();
  });
});
