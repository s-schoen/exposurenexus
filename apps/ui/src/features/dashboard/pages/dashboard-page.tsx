import { useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useMemo } from "react";

import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx";
import { MetricCard, metricValueClassName } from "@/components/metric-card.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { createListAssetsQueryOptions } from "@/features/assets";
import { computeDashboardOverview } from "@/features/dashboard/lib/metrics.ts";
import {
  FindingSeverityChart,
  FindingStatusChart,
  createFindingStatsQueryOptions,
} from "@/features/findings";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { MetricTone } from "@/components/metric-card.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";

const CHART_HEIGHT = "18rem";

// Top affected assets is a single series, so every bar takes the first chart color.
const TOP_ASSETS_COLOR = "var(--chart-1)";

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
          <MetricCard
            key={item.label}
            title={item.label}
            value={formatNumber(item.value)}
            href={item.href}
            tone={item.tone}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FindingSeverityChart data={findingStats.data.severity} height={CHART_HEIGHT} />
        <FindingStatusChart data={findingStats.data.status} height={CHART_HEIGHT} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <TopAffectedAssetsCard data={overview.topAssets} className="xl:col-span-2" />
        <Card>
          <CardHeader>
            <CardTitle>Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-border">
              <CoverageStat label="Healthy assets" value={formatNumber(overview.healthyAssets)} />
              <CoverageStat
                label="Mitigated rate"
                value={`${overview.mitigatedRate}%`}
                tone={overview.mitigatedRate > 0 ? "success" : "default"}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CoverageStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-13 text-muted-foreground">{label}</dt>
      <dd className={metricValueClassName(tone)}>{value}</dd>
    </div>
  );
}

function TopAffectedAssetsCard({
  data,
  className,
}: {
  data: Array<{ key: string; name: string; value: number }>;
  className?: string;
}) {
  const chartConfig = useMemo(
    () =>
      data.reduce<ChartConfig>(
        (config, item) => {
          config[item.key] = { label: item.name, color: TOP_ASSETS_COLOR };
          return config;
        },
        { value: { label: "Findings" } },
      ),
    [data],
  );

  const chartData = useMemo(
    () => data.map((item) => ({ label: item.key, value: item.value, fill: TOP_ASSETS_COLOR })),
    [data],
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Top affected assets</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-13 text-muted-foreground">
            No affected assets.
          </div>
        ) : (
          <SimpleBarChart chartData={chartData} chartConfig={chartConfig} height={CHART_HEIGHT} />
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString();
}
