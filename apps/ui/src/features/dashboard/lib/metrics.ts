import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import type { MetricTone } from "@/components/metric-card.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { FindingStatistics } from "@exposurenexus/contracts/model/finding";

/** Dashboard numbers, top affected assets and priority links derived from the stats. */
export function computeDashboardOverview(stats: FindingStatistics, assetList: Array<Asset>) {
  const totalFindings = stats.total;
  const totalAssets = assetList.length;
  const affectedAssets = Object.values(stats.assets).filter((value) => value > 0).length;
  const activeFindings = stats.status[FindingStatus.Active];
  const confirmedFindings = stats.status[FindingStatus.Confirmed];
  const criticalHighFindings = stats.severity.critical + stats.severity.high;
  const mitigatedFindings = stats.status[FindingStatus.Mitigated];
  const mitigatedRate =
    totalFindings > 0 ? Math.round((mitigatedFindings / totalFindings) * 100) : 0;

  const assetNamesById = new Map(assetList.map((asset) => [asset.id, asset.displayName]));

  const topAssets = Object.entries(stats.assets)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([assetId, count], index) => ({
      key: `asset-${index + 1}`,
      name: assetNamesById.get(assetId) ?? "Unknown asset",
      value: count,
    }));

  const priorityItems: Array<{
    label: string;
    value: number;
    tone: MetricTone;
    href: string;
  }> = [
    {
      label: "Needs review",
      value: criticalHighFindings,
      tone: criticalHighFindings > 0 ? "destructive" : "success",
      href: buildFilterHref("/findings", {
        severity: ["critical", "high"],
        status: ["active"],
      }),
    },
    {
      label: "Triage queue",
      value: activeFindings,
      tone: "default",
      href: buildFilterHref("/findings/triage", {
        status: ["active"],
      }),
    },
    {
      label: "Needs mitigation",
      value: confirmedFindings,
      tone: "default",
      href: buildFilterHref("/findings", {
        status: ["confirmed"],
      }),
    },
    {
      label: "Blast radius",
      value: affectedAssets,
      tone: "default",
      href: buildFilterHref("/findings", {
        status: ["active", "confirmed"],
      }),
    },
  ];

  return {
    totalFindings,
    totalAssets,
    affectedAssets,
    healthyAssets: Math.max(totalAssets - affectedAssets, 0),
    activeFindings,
    confirmedFindings,
    criticalHighFindings,
    mitigatedFindings,
    mitigatedRate,
    topAssets,
    priorityItems,
  };
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
