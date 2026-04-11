import { beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import finding from "./findings.js"
import * as findingService from "../service/finding.js"

vi.mock("../service/finding.js", () => ({
  listAll: vi.fn(),
  getByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByID: vi.fn()
}))

describe("finding routes", () => {
  const user = createTestUser()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes the authenticated user into finding creation", async () => {
    const requestId = "findings-create-request"
    const payload = {
      vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      source: FindingSource.Manual,
      evidence: "Observed exposed admin endpoint",
      mitigation: "Restrict access to internal networks",
      assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c"
    }
    const createdFinding = {
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      ...payload,
      fingerprint: "abc123",
      firstSeen: "2026-01-02T00:00:00.000Z",
      lastSeen: "2026-01-02T00:00:00.000Z",
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      vulnerability: {
        id: payload.vulnerabilityId,
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cwe: 284,
        cve: null,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    }

    vi.mocked(findingService.create).mockResolvedValue(createdFinding as any)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      findingRoute: finding
    })

    const response = await app.request("/api/findings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(findingService.create).toHaveBeenCalledWith({
      finding: payload,
      user
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: createdFinding
    })
  })
})
