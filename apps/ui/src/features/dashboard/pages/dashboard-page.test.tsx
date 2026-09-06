import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "@/features/dashboard/pages/dashboard-page.tsx";

import type { ReactNode } from "react";

interface QueryOptionsLike {
  queryKey: ReadonlyArray<unknown>;
}

interface DashboardAsset {
  id: string;
  displayName: string;
}

interface DashboardStats {
  assets: Record<string, number>;
  severity: Record<string, number>;
  status: Record<string, number>;
  total: number;
}

const mocks = vi.hoisted(() => ({
  assets: [
    { id: "447b53a7-c4e7-4b4e-a3b2-123456789abc", displayName: "edge-gateway" },
    { id: "7d5312b8-0f70-4d18-92b1-123456789abc", displayName: "worker-node" },
  ] as Array<DashboardAsset>,
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
  } as DashboardStats,
  usePageMeta: vi.fn(),
}));

const defaultAssets = mocks.assets;
const defaultStats = mocks.stats;

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: (options: QueryOptionsLike) => {
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
    mocks.assets = defaultAssets.map((asset) => ({ ...asset }));
    mocks.stats = {
      ...defaultStats,
      assets: { ...defaultStats.assets },
      severity: { ...defaultStats.severity },
      status: { ...defaultStats.status },
    };
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
    expect(screen.getByRole("link", { name: /needs mitigation/i })).toHaveAttribute(
      "href",
      "/findings?status=confirmed",
    );
    expect(screen.getByRole("link", { name: /blast radius/i })).toHaveAttribute(
      "href",
      "/findings?status=active%2Cconfirmed",
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

  it("renders a zero mitigated rate without producing NaN", () => {
    mocks.stats = {
      ...mocks.stats,
      total: 0,
      status: { ...mocks.stats.status, mitigated: 0 },
    };

    render(<DashboardPage />);

    expect(screen.getByText("0% of findings currently mitigated")).toBeVisible();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("shows the empty affected-assets chart when every asset count is zero", () => {
    mocks.stats = {
      ...mocks.stats,
      assets: {
        "447b53a7-c4e7-4b4e-a3b2-123456789abc": 0,
        "7d5312b8-0f70-4d18-92b1-123456789abc": 0,
      },
    };

    render(<DashboardPage />);

    expect(screen.getByText("No affected assets to display.")).toBeVisible();
  });

  it("sorts affected assets, removes zero counts, limits the chart to five, and labels unknown ids", () => {
    mocks.assets = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `asset-${index + 1}`,
        displayName: `Asset ${index + 1}`,
      })),
      { id: "zero-asset", displayName: "Zero asset" },
    ];
    mocks.stats = {
      ...mocks.stats,
      assets: {
        "asset-1": 10,
        "asset-2": 9,
        "unknown-asset": 8,
        "asset-3": 7,
        "asset-4": 6,
        "asset-5": 5,
        "asset-6": 4,
        "zero-asset": 0,
      },
    };

    render(<DashboardPage />);

    const unknownAsset = screen.getByText("Unknown asset: 8");
    const topAssetsChart = unknownAsset.closest("section");

    expect(topAssetsChart).not.toBeNull();
    expect(
      Array.from(topAssetsChart!.querySelectorAll("div")).map((entry) => entry.textContent),
    ).toEqual(["Asset 1: 10", "Asset 2: 9", "Unknown asset: 8", "Asset 3: 7", "Asset 4: 6"]);
    expect(screen.queryByText("Asset 5: 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Zero asset: 0")).not.toBeInTheDocument();
  });

  it("never reports a negative healthy-asset count", () => {
    mocks.assets = [
      { id: "asset-1", displayName: "Asset 1" },
      { id: "asset-2", displayName: "Asset 2" },
    ];
    mocks.stats = {
      ...mocks.stats,
      assets: {
        "asset-1": 4,
        "asset-2": 3,
        "unknown-asset": 2,
      },
    };

    render(<DashboardPage />);

    const healthyAssetsCard = screen.getByText("Healthy assets").closest("article");

    expect(healthyAssetsCard).not.toBeNull();
    expect(within(healthyAssetsCard!).getByText("0")).toBeVisible();
    expect(screen.queryByText("-1")).not.toBeInTheDocument();
  });
});
