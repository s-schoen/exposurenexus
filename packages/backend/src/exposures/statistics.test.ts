import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStatistics } from "./statistics.js";

describe("exposure statistics", () => {
  const statisticsPersistence = { countFindingsBy: vi.fn() };
  const logger = pino({ enabled: false });
  const database = {};

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizes sparse finding statistics in query order", async () => {
    statisticsPersistence.countFindingsBy.mockImplementation(async (_database, field: string) => {
      switch (field) {
        case "severity":
          return { [VulnerabilitySeverity.High]: 2, [VulnerabilitySeverity.Medium]: 1 };
        case "status":
          return { [FindingStatus.Active]: 2, [FindingStatus.Mitigated]: 1 };
        default:
          return { "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3 };
      }
    });

    const statistics = createStatistics({
      database: database as never,
      statisticsPersistence,
      logger,
    });

    await expect(statistics.getFindingStats()).resolves.toEqual({
      total: 3,
      status: {
        [FindingStatus.Active]: 2,
        [FindingStatus.Inactive]: 0,
        [FindingStatus.Confirmed]: 0,
        [FindingStatus.FalsePositive]: 0,
        [FindingStatus.RiskAccepted]: 0,
        [FindingStatus.Duplicate]: 0,
        [FindingStatus.OutOfScope]: 0,
        [FindingStatus.Mitigated]: 1,
      },
      severity: {
        [VulnerabilitySeverity.Info]: 0,
        [VulnerabilitySeverity.Low]: 0,
        [VulnerabilitySeverity.Medium]: 1,
        [VulnerabilitySeverity.High]: 2,
        [VulnerabilitySeverity.Critical]: 0,
      },
      assets: { "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3 },
    });
    expect(statisticsPersistence.countFindingsBy).toHaveBeenNthCalledWith(1, database, "severity");
    expect(statisticsPersistence.countFindingsBy).toHaveBeenNthCalledWith(2, database, "status");
    expect(statisticsPersistence.countFindingsBy).toHaveBeenNthCalledWith(3, database, "assetId");
  });

  it("maps persistence failures to the statistics application error", async () => {
    statisticsPersistence.countFindingsBy.mockRejectedValue(new Error("database offline"));

    await expect(
      createStatistics({
        database: database as never,
        statisticsPersistence,
        logger,
      }).getFindingStats(),
    ).rejects.toMatchObject({ code: "stats.get_finding_stats_failed", kind: "unexpected" });
  });
});
