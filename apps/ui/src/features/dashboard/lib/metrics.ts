import { FindingStatus } from "@exposurenexus/contracts/model/finding";

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
