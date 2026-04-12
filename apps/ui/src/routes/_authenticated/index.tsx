import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { FindingStatus } from "@openvlp/types/model/finding"
import {
  Activity,
  Bug,
  CircleCheckBig,
  Radar,
  Server,
  ShieldAlert,
  Waypoints
} from "lucide-react"
import { createListAssetsQueryOptions } from "@/api/asset.ts"
import { createFindingStatsQueryOptions } from "@/api/finding.ts"
import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx"
import { MetricCard } from "@/components/metric-card.tsx"
import { FindingSeverityChart } from "@/components/finding-severity-chart.tsx"
import { FindingStatusChart } from "@/components/finding-status-chart.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import type { ChartConfig } from "@/components/ui/chart.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: App
})

const DASHBOARD_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)"
]

function App() {
  usePageMeta({
    title: "Dashboard",
    description:
      "Monitor platform activity, finding trends, and current triage workload."
  })

  const findingStats = useQuery(createFindingStatsQueryOptions())
  const assets = useQuery(createListAssetsQueryOptions())

  const overview = useMemo(() => {
    const stats = findingStats.data
    const assetList = assets.data ?? []
    const totalFindings = stats?.total ?? 0
    const totalAssets = assetList.length
    const affectedAssets = Object.values(stats?.assets ?? {}).filter(
      (value) => value > 0
    ).length
    const activeFindings = stats?.status[FindingStatus.Active] ?? 0
    const confirmedFindings = stats?.status[FindingStatus.Confirmed] ?? 0
    const criticalHighFindings =
      (stats?.severity.critical ?? 0) + (stats?.severity.high ?? 0)
    const mitigatedFindings = stats?.status[FindingStatus.Mitigated] ?? 0
    const mitigatedRate =
      totalFindings > 0
        ? Math.round((mitigatedFindings / totalFindings) * 100)
        : 0

    const assetNamesById = new Map(
      assetList.map((asset) => [asset.id, asset.name])
    )

    const topAssets = Object.entries(stats?.assets ?? {})
      .filter(([, count]) => count > 0)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 5)
      .map(([assetId, count], index) => ({
        key: `asset-${index + 1}`,
        name: assetNamesById.get(assetId) ?? "Unknown asset",
        value: count
      }))

    const findingSources = Object.entries(stats?.source ?? {})
      .filter(([, count]) => count > 0)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 5)
      .map(([source, count], index) => ({
        key: `source-${index + 1}`,
        name: formatSource(source),
        value: count
      }))

    const priorityItems = [
      {
        label: "Needs review",
        description: "Critical and high severity findings",
        value: criticalHighFindings,
        tone:
          criticalHighFindings > 0
            ? "text-destructive"
            : "text-emerald-600 dark:text-emerald-400",
        href: buildFilterHref("/findings", {
          severity: ["critical", "high"],
          status: ["active"]
        })
      },
      {
        label: "Triage queue",
        description: "Findings still awaiting triage",
        value: activeFindings,
        tone: "text-foreground",
        href: buildFilterHref("/findings", {
          status: ["active"]
        })
      },
      {
        label: "Needs mitigation",
        description: "Confirmed findings awaiting remediation",
        value: confirmedFindings,
        tone: "text-foreground",
        href: buildFilterHref("/findings", {
          status: ["confirmed"]
        })
      },
      {
        label: "Blast radius",
        description: "Assets currently affected",
        value: affectedAssets,
        tone: "text-foreground",
        href: buildFilterHref("/findings", {
          status: ["active", "confirmed"]
        })
      }
    ]

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
      findingSources,
      priorityItems
    }
  }, [assets.data, findingStats.data])

  const chartsLoading = findingStats.isPending
  const cardsLoading = findingStats.isPending || assets.isPending

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm">
        <CardHeader className="gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-2">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  Overview
                </CardTitle>
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
          description="Current issue volume across all sources"
          icon={Bug}
          loading={cardsLoading}
        />
        <MetricCard
          title="Active findings"
          value={overview.activeFindings}
          description="Findings requiring mitigation"
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
              A compact view of asset impact and remediation progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Healthy assets"
              value={formatNumber(
                Math.max(overview.totalAssets - overview.affectedAssets, 0)
              )}
              description="Assets without any linked findings"
              icon={CircleCheckBig}
              loading={cardsLoading}
              variant="panel"
            />
            <MetricCard
              title="Source diversity"
              value={formatNumber(overview.findingSources.length)}
              description="Distinct inputs currently feeding the platform"
              icon={Waypoints}
              loading={chartsLoading}
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
          height={96}
          className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
        />
        <FindingStatusChart
          data={findingStats.data?.status || {}}
          loading={chartsLoading}
          height={96}
          className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <OverviewChartCard
          title="Top affected assets"
          description="Assets with the highest current finding volume."
          data={overview.topAssets}
          emptyMessage="No affected assets to display."
          loading={chartsLoading || assets.isPending}
        />
        <OverviewChartCard
          title="Finding sources"
          description="Where the current finding inventory originates from."
          data={overview.findingSources}
          emptyMessage="No finding sources available yet."
          loading={chartsLoading}
        />
      </div>
    </div>
  )
}

function OverviewChartCard({
  title,
  description,
  data,
  loading,
  emptyMessage
}: {
  title: string
  description: string
  data: Array<{ key: string; name: string; value: number }>
  loading?: boolean
  emptyMessage: string
}) {
  const chartConfig = useMemo(() => {
    return data.reduce<ChartConfig>(
      (config, item, index) => {
        config[item.key] = {
          label: item.name,
          color: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]
        }
        return config
      },
      {
        value: {
          label: "Findings"
        }
      }
    )
  }, [data])

  const chartData = useMemo(
    () =>
      data.map((item, index) => ({
        label: item.key,
        value: item.value,
        fill: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]
      })),
    [data]
  )

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
          <SimpleBarChart
            chartData={chartData}
            chartConfig={chartConfig}
            height={96}
          />
        )}
      </CardContent>
    </Card>
  )
}

function formatSource(source: string) {
  return source
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function buildFilterHref(
  pathname: string,
  filters: Record<string, Array<string>>
) {
  const params = new URLSearchParams()

  for (const [key, values] of Object.entries(filters)) {
    if (values.length > 0) {
      params.set(key, values.join(","))
    }
  }

  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}
