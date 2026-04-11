import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../repository/finding.js", () => ({
  countBy: vi.fn()
}))

import * as findingRepository from "../repository/finding.js"
import * as statsService from "./stats.js"

describe("stats service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("normalizes sparse finding statistics", async () => {
    vi.mocked(findingRepository.countBy).mockImplementation(async (field) => {
      switch (field) {
        case "severity":
          return {
            [VulnerabilitySeverity.High]: 2,
            [VulnerabilitySeverity.Medium]: 1
          }
        case "status":
          return {
            [FindingStatus.Active]: 2,
            [FindingStatus.Mitigated]: 1
          }
        case "assetId":
          return {
            "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3
          }
        case "source":
          return {
            nuclei: 3
          }
      }
    })

    await expect(statsService.getFindingStats()).resolves.toEqual({
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
    vi.mocked(findingRepository.countBy).mockRejectedValue(new Error("db offline"))

    await expect(statsService.getFindingStats()).rejects.toMatchObject({
      status: 500,
      message: "failed to retrieve statistics"
    } satisfies Partial<HTTPException>)
  })
})
