import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  FindingSource,
  FindingStatus
} from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { findingStats } from "./stats.js"
import * as statsService from "../service/stats.js"

vi.mock("../service/stats.js", () => ({
  getFindingStats: vi.fn()
}))

describe("finding stats routes", () => {
  const user = createTestUser()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns finding statistics for authenticated requests", async () => {
    const requestId = "findings-stats-request"
    const stats = {
      total: 3,
      status: {
        [FindingStatus.Active]: 2,
        [FindingStatus.Inactive]: 0,
        [FindingStatus.Confirmed]: 1,
        [FindingStatus.FalsePositive]: 0,
        [FindingStatus.RiskAccepted]: 0,
        [FindingStatus.Duplicate]: 0,
        [FindingStatus.OutOfScope]: 0,
        [FindingStatus.Mitigated]: 0
      },
      severity: {
        [VulnerabilitySeverity.Info]: 0,
        [VulnerabilitySeverity.Low]: 0,
        [VulnerabilitySeverity.Medium]: 1,
        [VulnerabilitySeverity.High]: 2,
        [VulnerabilitySeverity.Critical]: 0
      },
      source: {
        [FindingSource.Manual]: 3
      },
      assets: {
        "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c": 3
      }
    }

    vi.mocked(statsService.getFindingStats).mockResolvedValue(stats)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingStatsRoute: findingStats
    })

    const response = await app.request("/api/findings/stats", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(statsService.getFindingStats).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: stats
    })
  })

  it("maps unexpected service errors to a 500 reply", async () => {
    const requestId = "findings-stats-error-request"

    vi.mocked(statsService.getFindingStats).mockRejectedValue(
      new Error("database offline")
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingStatsRoute: findingStats
    })

    const response = await app.request("/api/findings/stats", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      correlationId: requestId,
      status: 500,
      error: "internal server error"
    })
  })
})
