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
    assets: {},
    ...overrides,
  };
}

describe("computeDashboardOverview", () => {
  it("derives totals, workload and the mitigated rate", () => {
    const assets = [buildAsset(), buildAsset()];
    const overview = computeDashboardOverview(
      stats({
        total: 5,
        status: { ...stats().status, active: 2, confirmed: 1, mitigated: 2 },
        severity: { ...stats().severity, critical: 1, high: 2 },
        assets: { [assets[0].id]: 5 },
      }),
      assets,
    );

    expect(overview).toMatchObject({
      totalFindings: 5,
      totalAssets: 2,
      affectedAssets: 1,
      healthyAssets: 1,
      activeFindings: 2,
      confirmedFindings: 1,
      criticalHighFindings: 3,
      mitigatedRate: 40,
    });
  });

  it("reports a zero mitigated rate instead of NaN without findings", () => {
    expect(computeDashboardOverview(stats(), []).mitigatedRate).toBe(0);
  });

  it("ranks the five most affected assets, skipping zero counts and naming unknown ids", () => {
    const assets = Array.from({ length: 6 }, (_, index) =>
      buildAsset({ displayName: `asset-${index + 1}` }),
    );
    const counts = Object.fromEntries(assets.map((asset, index) => [asset.id, index + 1]));
    const unknownId = "10000000-0000-4000-8000-0000000000ff";

    const { topAssets } = computeDashboardOverview(
      stats({ assets: { ...counts, [assets[5].id]: 0, [unknownId]: 9 } }),
      assets,
    );

    expect(topAssets.map(({ name, value }) => [name, value])).toEqual([
      ["Unknown asset", 9],
      ["asset-5", 5],
      ["asset-4", 4],
      ["asset-3", 3],
      ["asset-2", 2],
    ]);
  });

  it("never reports a negative healthy-asset count", () => {
    const asset = buildAsset();
    const overview = computeDashboardOverview(
      stats({ assets: { [asset.id]: 1, "10000000-0000-4000-8000-0000000000ff": 1 } }),
      [asset],
    );

    expect(overview.affectedAssets).toBe(2);
    expect(overview.healthyAssets).toBe(0);
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
