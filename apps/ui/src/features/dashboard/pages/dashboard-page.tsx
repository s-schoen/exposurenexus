import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, Bug, CircleCheckBig, Radar, Server, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx";
import { MetricCard } from "@/components/metric-card.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { createListAssetsQueryOptions } from "@/features/assets";
import {
  FindingSeverityChart,
  FindingStatusChart,
  createFindingStatsQueryOptions,
} from "@/features/findings";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { ChartConfig } from "@/components/ui/chart.tsx";

const DASHBOARD_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DashboardPage() {
  usePageMeta({
    title: "Dashboard",
    description: "Monitor platform activity, finding trends, and current triage workload.",
  });

  const findingStats = useQuery(createFindingStatsQueryOptions());
  const assets = useQuery(createListAssetsQueryOptions());

  const overview = useMemo(() => {
    const stats = findingStats.data;
    const assetList = assets.data ?? [];
    const totalFindings = stats?.total ?? 0;
    const totalAssets = assetList.length;
    const affectedAssets = Object.values(stats?.assets ?? {}).filter((value) => value > 0).length;
    const activeFindings = stats?.status[FindingStatus.Active] ?? 0;
    const confirmedFindings = stats?.status[FindingStatus.Confirmed] ?? 0;
    const criticalHighFindings = (stats?.severity.critical ?? 0) + (stats?.severity.high ?? 0);
    const mitigatedFindings = stats?.status[FindingStatus.Mitigated] ?? 0;
    const mitigatedRate =
      totalFindings > 0 ? Math.round((mitigatedFindings / totalFindings) * 100) : 0;

    const assetNamesById = new Map(assetList.map((asset) => [asset.id, asset.displayName]));

    const topAssets = Object.entries(stats?.assets ?? {})
      .filter(([, count]) => count > 0)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 5)
      .map(([assetId, count], index) => ({
        key: `asset-${index + 1}`,
        name: assetNamesById.get(assetId) ?? "Unknown asset",
        value: count,
      }));

    const priorityItems = [
      {
        label: "Needs review",
        description: "Critical and high severity findings",
        value: criticalHighFindings,
        tone:
          criticalHighFindings > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
        href: buildFilterHref("/findings", {
          severity: ["critical", "high"],
          status: ["active"],
        }),
      },
      {
        label: "Triage queue",
        description: "Findings still awaiting triage",
        value: activeFindings,
        tone: "text-foreground",
        href: buildFilterHref("/findings/triage", {
          status: ["active"],
        }),
      },
      {
        label: "Needs mitigation",
        description: "Confirmed findings awaiting mitigation",
        value: confirmedFindings,
        tone: "text-foreground",
        href: buildFilterHref("/findings", {
          status: ["confirmed"],
        }),
      },
      {
        label: "Blast radius",
        description: "Assets currently affected",
        value: affectedAssets,
        tone: "text-foreground",
        href: buildFilterHref("/findings", {
          status: ["active", "confirmed"],
        }),
      },
    ];

    return {
      totalFindings,
      totalAssets,
      affectedAssets,
      activeFindings,
      confirmedFindings,
      criticalHighFindings,
      mitigatedFindings,
      mitigatedRate,
      topAssets,
      priorityItems,
    };
  }, [assets.data, findingStats.data]);

  const chartsLoading = findingStats.isPending;
  const cardsLoading = findingStats.isPending || assets.isPending;

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm">
        <CardHeader className="gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-2">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">Overview</CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {cardsLoading ? (
            <>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </>
          ) : (
            overview.priorityItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className="transition-colors hover:[&>div]:bg-accent/70"
              >
                <MetricCard
                  title={item.label}
                  description={item.description}
                  value={formatNumber(item.value)}
                  loading={cardsLoading}
                  variant="panel"
                  className="h-full"
                  valueClassName={item.tone}
                  titleClassName="text-xs uppercase tracking-[0.2em] text-muted-foreground"
                  descriptionClassName="text-sm leading-6 text-muted-foreground"
                />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Total findings"
          value={overview.totalFindings}
          description="Current human-facing workflow cases"
          icon={Bug}
          loading={cardsLoading}
        />
        <MetricCard
          title="Active findings"
          value={overview.activeFindings}
          description="Findings awaiting triage"
          icon={Activity}
          loading={cardsLoading}
        />
        <MetricCard
          title="Critical / high"
          value={overview.criticalHighFindings}
          description="Highest severity exposure right now"
          icon={ShieldAlert}
          loading={cardsLoading}
          emphasis={overview.criticalHighFindings > 0}
        />
        <MetricCard
          title="Total assets"
          value={overview.totalAssets}
          description="Inventory currently tracked in the platform"
          icon={Server}
          loading={cardsLoading}
        />
        <MetricCard
          title="Affected assets"
          value={overview.affectedAssets}
          description={`${overview.mitigatedRate}% of findings currently mitigated`}
          icon={Radar}
          loading={cardsLoading}
        />
      </div>

      <div className="grid gap-4">
        <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Coverage</CardTitle>
            <CardDescription>
              A compact view of asset impact and mitigation progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <MetricCard
              title="Healthy assets"
              value={formatNumber(Math.max(overview.totalAssets - overview.affectedAssets, 0))}
              description="Assets without any linked findings"
              icon={CircleCheckBig}
              loading={cardsLoading}
              variant="panel"
            />
            <MetricCard
              title="Mitigated rate"
              value={`${overview.mitigatedRate}%`}
              description="Share of findings already mitigated"
              icon={ShieldAlert}
              loading={cardsLoading}
              variant="panel"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FindingSeverityChart
          data={findingStats.data?.severity || {}}
          loading={chartsLoading}
          height="24rem"
          className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
        />
        <FindingStatusChart
          data={findingStats.data?.status || {}}
          loading={chartsLoading}
          height="24rem"
          className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
        />
      </div>

      <div className="grid gap-4">
        <OverviewChartCard
          title="Top affected assets"
          description="Assets with the highest current finding volume."
          data={overview.topAssets}
          emptyMessage="No affected assets to display."
          loading={chartsLoading || assets.isPending}
        />
      </div>
    </div>
  );
}

function OverviewChartCard({
  title,
  description,
  data,
  loading,
  emptyMessage,
}: {
  title: string;
  description: string;
  data: Array<{ key: string; name: string; value: number }>;
  loading?: boolean;
  emptyMessage: string;
}) {
  const chartConfig = useMemo(() => {
    return data.reduce<ChartConfig>(
      (config, item, index) => {
        config[item.key] = {
          label: item.name,
          color: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
        };
        return config;
      },
      {
        value: {
          label: "Findings",
        },
      },
    );
  }, [data]);

  const chartData = useMemo(
    () =>
      data.map((item, index) => ({
        label: item.key,
        value: item.value,
        fill: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
      })),
    [data],
  );

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-96 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <SimpleBarChart chartData={chartData} chartConfig={chartConfig} height="24rem" />
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function buildFilterHref(pathname: string, filters: Record<string, Array<string>>) {
  const params = new URLSearchParams();

  for (const [key, values] of Object.entries(filters)) {
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  }

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
