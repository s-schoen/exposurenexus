import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStatistics } from "./statistics.js";

describe("exposure statistics", () => {
  const findingRepository = { countBy: vi.fn() };
  const logger = pino({ enabled: false });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizes sparse finding statistics in query order", async () => {
    findingRepository.countBy.mockImplementation(async (field: string) => {
      switch (field) {
        case "severity":
          return { [VulnerabilitySeverity.High]: 2, [VulnerabilitySeverity.Medium]: 1 };
        case "status":
          return { [FindingStatus.Active]: 2, [FindingStatus.Mitigated]: 1 };
        default:
          return { "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3 };
      }
    });

    const statistics = createStatistics({ findingRepository, logger });

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
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(1, "severity");
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(2, "status");
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(3, "assetId");
  });

  it("maps persistence failures to the statistics application error", async () => {
    findingRepository.countBy.mockRejectedValue(new Error("database offline"));

    await expect(
      createStatistics({ findingRepository, logger }).getFindingStats(),
    ).rejects.toMatchObject({ code: "stats.get_finding_stats_failed", kind: "unexpected" });
  });
});
