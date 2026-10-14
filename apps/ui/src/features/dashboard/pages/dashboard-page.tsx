import { useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useMemo } from "react";

import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx";
import { MetricCard } from "@/components/metric-card.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { createListAssetsQueryOptions } from "@/features/assets";
import { computeDashboardOverview } from "@/features/dashboard/lib/metrics.ts";
import {
  FindingSeverityChart,
  FindingStatusChart,
  createFindingStatsQueryOptions,
} from "@/features/findings";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { DashboardMetric } from "@/features/dashboard/lib/metrics.ts";

const CHART_HEIGHT = "18rem";

// Top affected assets is a single series. It takes the primary color, not a severity's.
const TOP_ASSETS_COLOR = "var(--primary)";

export function DashboardPage() {
  usePageMeta({
    title: "Dashboard",
    icon: LayoutGrid,
  });

  const findingStats = useSuspenseQuery(createFindingStatsQueryOptions());
  const assets = useSuspenseQuery(createListAssetsQueryOptions());

  const overview = useMemo(
    () => computeDashboardOverview(findingStats.data, assets.data),
    [assets.data, findingStats.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.priorityItems.map((item) => (
          <DashboardMetricCard key={item.label} metric={item} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FindingSeverityChart data={findingStats.data.severity} height={CHART_HEIGHT} />
        <FindingStatusChart data={findingStats.data.status} height={CHART_HEIGHT} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <TopAffectedAssetsCard data={overview.topAssets} className="xl:col-span-2" />
        <section
          aria-label="Coverage"
          className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1"
        >
          {overview.coverageItems.map((item) => (
            <DashboardMetricCard key={item.label} metric={item} />
          ))}
        </section>
      </div>
    </div>
  );
}

function DashboardMetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <MetricCard
      title={metric.label}
      value={metric.displayValue ?? formatNumber(metric.value)}
      href={metric.href}
      tone={metric.tone}
    />
  );
}

function TopAffectedAssetsCard({
  data,
  className,
}: {
  data: Array<{ key: string; name: string; value: number; href: string }>;
  className?: string;
}) {
  const chartConfig = useMemo(
    () =>
      data.reduce<ChartConfig>(
        (config, item) => {
          config[item.key] = { label: item.name, color: TOP_ASSETS_COLOR };
          return config;
        },
        { value: { label: "Open findings" } },
      ),
    [data],
  );

  const chartData = useMemo(
    () => data.map((item) => ({ label: item.key, value: item.value, fill: TOP_ASSETS_COLOR })),
    [data],
  );

  const hrefByKey = useMemo(() => new Map(data.map((item) => [item.key, item.href])), [data]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Top affected assets</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleBarChart
          chartData={chartData}
          chartConfig={chartConfig}
          height={CHART_HEIGHT}
          emptyMessage="No affected assets."
          getHref={(key) => hrefByKey.get(key) ?? "/assets"}
        />
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString();
}
