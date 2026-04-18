import { beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

vi.mock("../lib/auth.js", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn()
    }
  }
}))

import { auth } from "../lib/auth.js"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createFindingStatsRoute } from "./stats.js"

describe("finding stats routes", () => {
  const user = createTestUser()
  const statsService = {
    getFindingStats: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth.api.userHasPermission).mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "findings-stats-unauthorized-request"
    const app = createTestApp({
      findingStatsRoute: createFindingStatsRoute(statsService),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/findings/stats", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized"
    })
    expect(statsService.getFindingStats).not.toHaveBeenCalled()
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

    statsService.getFindingStats.mockResolvedValue(stats)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingStatsRoute: createFindingStatsRoute(statsService)
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

  it("returns 403 when reading stats without read permission", async () => {
    vi.mocked(auth.api.userHasPermission).mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingStatsRoute: createFindingStatsRoute(statsService)
    })

    const response = await app.request("/api/findings/stats", {
      headers: {
        "X-Request-Id": "findings-stats-forbidden-request"
      }
    })

    expect(response.status).toBe(403)
    expect(auth.api.userHasPermission).toHaveBeenCalledWith({
      body: {
        userId: user.id,
        permissions: {
          stats: ["read"]
        }
      }
    })
    expect(statsService.getFindingStats).not.toHaveBeenCalled()
  })

  it("maps unexpected service errors to a 500 reply", async () => {
    const requestId = "findings-stats-error-request"

    statsService.getFindingStats.mockRejectedValue(
      new Error("database offline")
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingStatsRoute: createFindingStatsRoute(statsService)
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
