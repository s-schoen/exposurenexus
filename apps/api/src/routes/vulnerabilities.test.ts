import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  VulnerabilitySeverity,
  type Vulnerability
} from "@openvlp/types/model/vulnerability"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createVulnerabilityRoute } from "./vulnerabilities.js"

describe("vulnerability routes", () => {
  const user = createTestUser()
  const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
  const vulnerabilityService = {
    listAll: vi.fn(),
    getByID: vi.fn()
  }
  const vulnerabilityRecord = {
    id: vulnerabilityId,
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  } satisfies Vulnerability

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "vulnerabilities-unauthorized-request"
    const app = createTestApp({
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/vulnerabilities", {
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
    expect(vulnerabilityService.listAll).not.toHaveBeenCalled()
  })

  it("returns all vulnerabilities for authenticated requests", async () => {
    const requestId = "vulnerabilities-list-request"

    vulnerabilityService.listAll.mockResolvedValue([vulnerabilityRecord])

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService)
    })

    const response = await app.request("/api/vulnerabilities", {
      headers: {
        "X-Request-Id": requestId
      }
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(vulnerabilityService.listAll).toHaveBeenCalledOnce()
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        items: [
          {
            ...vulnerabilityRecord,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        totalItems: 1,
        startIndex: 0,
        currentItemCount: 1
      }
    })
  })

  it("returns a vulnerability by id", async () => {
    const requestId = "vulnerabilities-get-by-id-request"

    vulnerabilityService.getByID.mockResolvedValue(vulnerabilityRecord)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService)
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(vulnerabilityId)
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...vulnerabilityRecord,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    })
  })

  it("rejects invalid vulnerability ids before calling the service", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService)
    })

    const response = await app.request("/api/vulnerabilities/not-a-uuid", {
      headers: {
        "X-Request-Id": "vulnerabilities-invalid-id-request"
      }
    })

    expect(response.status).toBe(400)
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled()
  })

  it("returns 404 when the vulnerability does not exist", async () => {
    const requestId = "vulnerabilities-not-found-request"

    vulnerabilityService.getByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(vulnerabilityService)
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        headers: {
          "X-Request-Id": requestId
        }
      }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(vulnerabilityId)
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `vulnerability with id ${vulnerabilityId} does not exist`
    })
  })
})
