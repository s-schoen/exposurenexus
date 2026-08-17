import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStatsService } from "./stats.js";

import type { ApplicationError } from "./application-error.js";

describe("stats service", () => {
  const findingRepository = {
    countBy: vi.fn(),
  };
  const logger = pino({ enabled: false });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes sparse finding statistics", async () => {
    const service = createStatsService({ findingRepository, logger });

    findingRepository.countBy.mockImplementation(async (field) => {
      switch (field) {
        case "severity":
          return {
            [VulnerabilitySeverity.High]: 2,
            [VulnerabilitySeverity.Medium]: 1,
          } as Record<string, number>;
        case "status":
          return {
            [FindingStatus.Active]: 2,
            [FindingStatus.Mitigated]: 1,
          } as Record<string, number>;
        case "assetId":
          return {
            "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3,
          } as Record<string, number>;
      }
    });

    await expect(service.getFindingStats()).resolves.toEqual({
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
      assets: {
        "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3,
      },
    });
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(1, "severity");
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(2, "status");
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(3, "assetId");
    expect(findingRepository.countBy).toHaveBeenCalledTimes(3);
  });

  it("maps repository failures to an application error", async () => {
    const service = createStatsService({ findingRepository, logger });

    findingRepository.countBy.mockRejectedValue(new Error("db offline"));

    await expect(service.getFindingStats()).rejects.toMatchObject({
      code: "stats.get_finding_stats_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });
});
