import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import { FindingStatus } from "@exposurenexus/types/model/finding"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import { createStatsService } from "./stats.js"

describe("stats service", () => {
  const findingRepository = {
    countBy: vi.fn()
  }
  const logger = pino({ enabled: false })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("normalizes sparse finding statistics", async () => {
    const service = createStatsService({ findingRepository, logger })

    findingRepository.countBy.mockImplementation(async (field) => {
      switch (field) {
        case "severity":
          return {
            [VulnerabilitySeverity.High]: 2,
            [VulnerabilitySeverity.Medium]: 1
          } as Record<string, number>
        case "status":
          return {
            [FindingStatus.Active]: 2,
            [FindingStatus.Mitigated]: 1
          } as Record<string, number>
        case "assetId":
          return {
            "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3
          } as Record<string, number>
        case "source":
          return {
            nuclei: 3
          } as Record<string, number>
      }
    })

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
        [FindingStatus.Mitigated]: 1
      },
      severity: {
        [VulnerabilitySeverity.Info]: 0,
        [VulnerabilitySeverity.Low]: 0,
        [VulnerabilitySeverity.Medium]: 1,
        [VulnerabilitySeverity.High]: 2,
        [VulnerabilitySeverity.Critical]: 0
      },
      assets: {
        "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3
      },
      source: {
        nuclei: 3
      }
    })
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(1, "severity")
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(2, "status")
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(3, "assetId")
    expect(findingRepository.countBy).toHaveBeenNthCalledWith(4, "source")
  })

  it("maps repository failures to an HTTP 500", async () => {
    const service = createStatsService({ findingRepository, logger })

    findingRepository.countBy.mockRejectedValue(new Error("db offline"))

    await expect(service.getFindingStats()).rejects.toMatchObject({
      status: 500,
      message: "failed to retrieve statistics"
    } satisfies Partial<HTTPException>)
  })
})
