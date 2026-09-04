import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "@/features/dashboard/pages/dashboard-page.tsx";

import type { ReactNode } from "react";

interface QueryOptionsLike {
  queryKey: ReadonlyArray<unknown>;
}

const mocks = vi.hoisted(() => ({
  assets: [
    { id: "447b53a7-c4e7-4b4e-a3b2-123456789abc", displayName: "edge-gateway" },
    { id: "7d5312b8-0f70-4d18-92b1-123456789abc", displayName: "worker-node" },
  ],
  stats: {
    assets: {
      "447b53a7-c4e7-4b4e-a3b2-123456789abc": 5,
    },
    severity: {
      critical: 1,
      high: 2,
      info: 0,
      low: 1,
      medium: 6,
    },
    status: {
      active: 3,
      confirmed: 2,
      duplicate: 0,
      false_positive: 0,
      inactive: 1,
      mitigated: 4,
      out_of_scope: 0,
      risk_accepted: 0,
    },
    total: 10,
  },
  usePageMeta: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptionsLike) => {
    const queryKey = options.queryKey.join("/");

    if (queryKey === "findings/stats") {
      return {
        data: mocks.stats,
        isPending: false,
      };
    }

    if (queryKey === "assets") {
      return {
        data: mocks.assets,
        isPending: false,
      };
    }

    throw new Error(`Unhandled query key ${queryKey}`);
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/assets", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"],
  }),
}));

vi.mock("@/features/findings", () => ({
  createFindingStatsQueryOptions: () => ({
    queryKey: ["findings", "stats"],
  }),
  FindingSeverityChart: ({ data }: { data: Record<string, number> }) => (
    <section>Severity chart {data[VulnerabilitySeverity.Critical]}</section>
  ),
  FindingStatusChart: ({ data }: { data: Record<string, number> }) => (
    <section>Status chart {data[FindingStatus.Active]}</section>
  ),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/components/metric-card.tsx", () => ({
  MetricCard: ({
    description,
    title,
    value,
  }: {
    description: string;
    title: string;
    value: ReactNode;
  }) => (
    <article>
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{value}</div>
    </article>
  ),
}));

vi.mock("@/components/chart/simple-bar-chart.tsx", () => ({
  SimpleBarChart: ({
    chartConfig,
    chartData,
  }: {
    chartConfig: Record<string, { label?: string }>;
    chartData: Array<{ label: string; value: number }>;
  }) => (
    <section>
      {chartData.map((item) => (
        <div key={item.label}>
          {chartConfig[item.label].label}: {item.value}
        </div>
      ))}
    </section>
  ),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dashboard metrics and priority links from stats", () => {
    render(<DashboardPage />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Dashboard",
      description: "Monitor platform activity, finding trends, and current triage workload.",
    });
    expect(screen.getByRole("link", { name: /needs review/i })).toHaveAttribute(
      "href",
      "/findings?severity=critical%2Chigh&status=active",
    );
    expect(screen.getByRole("link", { name: /triage queue/i })).toHaveAttribute(
      "href",
      "/findings/triage?status=active",
    );
    expect(screen.getByRole("heading", { name: "Total findings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Affected assets" })).toBeTruthy();
    expect(screen.getByText("40% of findings currently mitigated")).toBeTruthy();
    expect(screen.getByText("Severity chart 1")).toBeTruthy();
    expect(screen.getByText("Status chart 3")).toBeTruthy();
    expect(screen.getByText("Top affected assets")).toBeTruthy();
    expect(screen.getByText(/edge-gateway/)).toBeTruthy();
    expect(screen.queryByText("Finding sources")).toBeNull();
    expect(screen.queryByText("Source diversity")).toBeNull();
    expect(screen.getByText("Current human-facing workflow cases")).toBeTruthy();
    expect(screen.getByText("Findings awaiting triage")).toBeTruthy();
  });
});
