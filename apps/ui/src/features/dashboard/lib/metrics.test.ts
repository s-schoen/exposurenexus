import { AssetLifecycleState } from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it } from "vitest";

import { buildFilterHref, computeDashboardOverview } from "@/features/dashboard/lib/metrics.ts";
import { buildAsset } from "@/mocks/fixtures/index.ts";

import type { FindingStatistics } from "@exposurenexus/contracts/model/finding";

function stats(overrides: Partial<FindingStatistics> = {}): FindingStatistics {
  return {
    total: 0,
    status: {
      [FindingStatus.Active]: 0,
      [FindingStatus.Inactive]: 0,
      [FindingStatus.Confirmed]: 0,
      [FindingStatus.FalsePositive]: 0,
      [FindingStatus.RiskAccepted]: 0,
      [FindingStatus.Duplicate]: 0,
      [FindingStatus.OutOfScope]: 0,
      [FindingStatus.Mitigated]: 0,
    },
    severity: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
    activeSeverity: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
    assets: {},
    openAssets: {},
    ...overrides,
  };
}

function metric(overview: ReturnType<typeof computeDashboardOverview>, label: string) {
  const item = [...overview.priorityItems, ...overview.coverageItems].find(
    (candidate) => candidate.label === label,
  );
  if (!item) {
    throw new Error(`No dashboard metric labeled ${label}`);
  }
  return item;
}

describe("computeDashboardOverview", () => {
  it("counts critical and high findings awaiting review, as its link filters them", () => {
    const overview = computeDashboardOverview(
      stats({
        severity: { info: 0, low: 0, medium: 0, high: 4, critical: 2 },
        activeSeverity: { info: 0, low: 0, medium: 1, high: 2, critical: 1 },
      }),
      [],
    );

    expect(metric(overview, "Needs review")).toEqual({
      label: "Needs review",
      value: 3,
      tone: "destructive",
      href: "/findings?severity=critical%2Chigh&status=active",
    });
    expect(metric(computeDashboardOverview(stats(), []), "Needs review").tone).toBe("success");
  });

  it("counts the triage queue and confirmed findings by status", () => {
    const overview = computeDashboardOverview(
      stats({ status: { ...stats().status, active: 2, confirmed: 1, mitigated: 5 } }),
      [],
    );

    expect(metric(overview, "Triage queue")).toMatchObject({
      value: 2,
      tone: "default",
      href: "/findings/triage?status=active",
    });
    expect(metric(overview, "Needs mitigation")).toMatchObject({
      value: 1,
      tone: "default",
      href: "/findings?status=confirmed",
    });
  });

  it("counts listed assets with open findings, ignoring handled ones", () => {
    const [exposed, handled, archivedExposed] = [
      buildAsset(),
      buildAsset(),
      buildAsset({ lifecycleState: AssetLifecycleState.Archived }),
    ];
    const overview = computeDashboardOverview(
      stats({
        assets: { [exposed.id]: 2, [handled.id]: 3, [archivedExposed.id]: 1 },
        openAssets: {
          [exposed.id]: 1,
          [archivedExposed.id]: 1,
          // Not in the asset list, so not on the page the link opens.
          "10000000-0000-4000-8000-0000000000ff": 1,
        },
      }),
      [exposed, handled, archivedExposed],
    );

    expect(metric(overview, "Affected assets")).toMatchObject({
      value: 2,
      tone: "default",
      href: "/assets?assetOpenFindings=some",
    });
  });

  it("counts active assets without open findings as healthy", () => {
    const [exposed, handled, untouched, archived] = [
      buildAsset(),
      buildAsset(),
      buildAsset(),
      buildAsset({ lifecycleState: AssetLifecycleState.Archived }),
    ];
    const overview = computeDashboardOverview(
      stats({
        assets: { [exposed.id]: 1, [handled.id]: 2 },
        openAssets: { [exposed.id]: 1 },
      }),
      [exposed, handled, untouched, archived],
    );

    expect(metric(overview, "Healthy assets")).toMatchObject({
      value: 2,
      tone: "default",
      href: "/assets?assetLifecycleState=active&assetOpenFindings=none",
    });
  });

  it("shows the mitigated rate in a neutral tone and links to the mitigated findings", () => {
    const overview = computeDashboardOverview(
      stats({ total: 5, status: { ...stats().status, active: 3, mitigated: 2 } }),
      [],
    );

    expect(metric(overview, "Mitigated rate")).toEqual({
      label: "Mitigated rate",
      value: 2,
      displayValue: "40%",
      tone: "default",
      href: "/findings?status=mitigated",
    });
  });

  it("reports a zero mitigated rate instead of NaN without findings", () => {
    expect(metric(computeDashboardOverview(stats(), []), "Mitigated rate").displayValue).toBe("0%");
  });

  it("ranks the five assets with the most open findings and links each one", () => {
    const assets = Array.from({ length: 6 }, (_, index) =>
      buildAsset({ displayName: `asset-${index + 1}` }),
    );
    const counts = Object.fromEntries(assets.map((asset, index) => [asset.id, index + 1]));
    const unknownId = "10000000-0000-4000-8000-0000000000ff";

    const { topAssets } = computeDashboardOverview(
      stats({
        // Findings in any status don't rank an asset.
        assets: { [assets[0].id]: 50 },
        openAssets: { ...counts, [assets[5].id]: 0, [unknownId]: 9 },
      }),
      assets,
    );

    expect(topAssets.map(({ name, value }) => [name, value])).toEqual([
      ["Unknown asset", 9],
      ["asset-5", 5],
      ["asset-4", 4],
      ["asset-3", 3],
      ["asset-2", 2],
    ]);
    expect(topAssets[1].href).toBe(`/assets/${assets[4].id}`);
  });
});

describe("buildFilterHref", () => {
  it("joins filter values and omits empty filters", () => {
    expect(buildFilterHref("/findings", { severity: ["critical", "high"], status: [] })).toBe(
      "/findings?severity=critical%2Chigh",
    );
    expect(buildFilterHref("/findings", {})).toBe("/findings");
  });
});
