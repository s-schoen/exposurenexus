import { AssetLifecycleState } from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { AssetOpenFindingsFilter } from "@/features/assets";

import type { MetricTone } from "@/components/metric-card.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { FindingStatistics } from "@exposurenexus/contracts/model/finding";

/** A dashboard number and the list behind it: the list opened by `href` shows `value` rows. */
export interface DashboardMetric {
  label: string;
  value: number;
  /** How the number reads, such as "40%"; defaults to the number itself. */
  displayValue?: string;
  tone: MetricTone;
  href: string;
}

/** Dashboard numbers, top affected assets and their links, derived from the stats. */
export function computeDashboardOverview(stats: FindingStatistics, assetList: Array<Asset>) {
  const openFindingCount = (asset: Asset) => stats.openAssets[asset.id] ?? 0;
  const needsReview = stats.activeSeverity.critical + stats.activeSeverity.high;
  const affectedAssets = assetList.filter((asset) => openFindingCount(asset) > 0).length;
  const healthyAssets = assetList.filter(
    (asset) => asset.lifecycleState === AssetLifecycleState.Active && openFindingCount(asset) === 0,
  ).length;
  const mitigatedFindings = stats.status[FindingStatus.Mitigated];
  const mitigatedRate = stats.total > 0 ? Math.round((mitigatedFindings / stats.total) * 100) : 0;

  const assetNamesById = new Map(assetList.map((asset) => [asset.id, asset.displayName]));

  const topAssets = Object.entries(stats.openAssets)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([assetId, count], index) => ({
      key: `asset-${index + 1}`,
      name: assetNamesById.get(assetId) ?? "Unknown asset",
      value: count,
      href: `/assets/${assetId}`,
    }));

  const priorityItems: Array<DashboardMetric> = [
    {
      label: "Needs review",
      value: needsReview,
      tone: needsReview > 0 ? "destructive" : "success",
      href: buildFilterHref("/findings", {
        severity: ["critical", "high"],
        status: [FindingStatus.Active],
      }),
    },
    {
      label: "Triage queue",
      value: stats.status[FindingStatus.Active],
      tone: "default",
      href: buildFilterHref("/findings/triage", {
        status: [FindingStatus.Active],
      }),
    },
    {
      label: "Needs mitigation",
      value: stats.status[FindingStatus.Confirmed],
      tone: "default",
      href: buildFilterHref("/findings", {
        status: [FindingStatus.Confirmed],
      }),
    },
    {
      label: "Affected assets",
      value: affectedAssets,
      tone: "default",
      href: buildFilterHref("/assets", {
        assetOpenFindings: [AssetOpenFindingsFilter.Some],
      }),
    },
  ];

  const coverageItems: Array<DashboardMetric> = [
    {
      label: "Healthy assets",
      value: healthyAssets,
      tone: "default",
      href: buildFilterHref("/assets", {
        assetLifecycleState: [AssetLifecycleState.Active],
        assetOpenFindings: [AssetOpenFindingsFilter.None],
      }),
    },
    {
      label: "Mitigated rate",
      value: mitigatedFindings,
      displayValue: `${mitigatedRate}%`,
      tone: "default",
      href: buildFilterHref("/findings", {
        status: [FindingStatus.Mitigated],
      }),
    },
  ];

  return { priorityItems, coverageItems, topAssets };
}

export function buildFilterHref(pathname: string, filters: Record<string, Array<string>>) {
  const params = new URLSearchParams();

  for (const [key, values] of Object.entries(filters)) {
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  }

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
