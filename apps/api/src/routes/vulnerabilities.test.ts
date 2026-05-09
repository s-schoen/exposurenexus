import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createVulnerabilitySchema,
  updateVulnerabilitySchema,
  VulnerabilitySeverity,
  type Vulnerability
} from "@exposurenexus/types/model/vulnerability"
import { HTTPException } from "hono/http-exception"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createRequireDomainPermission } from "../middleware/auth.js"
import { createVulnerabilityRoute } from "./vulnerabilities.js"

describe("vulnerability routes", () => {
  const user = createTestUser()
  const userHasPermission = vi.fn()
  const routeDependencies = {
    requireDomainPermission: createRequireDomainPermission(userHasPermission)
  }
  const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
  const vulnerabilityService = {
    listAll: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn()
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
    userHasPermission.mockResolvedValue(true)
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "vulnerabilities-unauthorized-request"
    const app = createTestApp({
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      ),
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
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
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

  it("returns 403 when listing vulnerabilities without read permission", async () => {
    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request("/api/vulnerabilities", {
      headers: {
        "X-Request-Id": "vulnerabilities-list-forbidden-request"
      }
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      vulnerability: ["read"]
    })
    expect(vulnerabilityService.listAll).not.toHaveBeenCalled()
  })

  it("returns 201 when creating a vulnerability", async () => {
    const requestId = "vulnerabilities-create-request"
    const payload = {
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null
    } satisfies typeof createVulnerabilitySchema._output

    vulnerabilityService.create.mockResolvedValue(vulnerabilityRecord)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(vulnerabilityService.create).toHaveBeenCalledWith({
      vulnerability: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...vulnerabilityRecord,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    })
  })

  it("returns 403 when creating a vulnerability without write permission", async () => {
    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "vulnerabilities-create-forbidden-request"
      },
      body: JSON.stringify({
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: null,
        cwe: null,
        cve: null
      })
    })

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      vulnerability: ["write"]
    })
    expect(vulnerabilityService.create).not.toHaveBeenCalled()
  })

  it("rejects invalid vulnerability create payloads", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "vulnerabilities-invalid-create-request"
      },
      body: JSON.stringify({
        title: "",
        severity: VulnerabilitySeverity.High,
        description: null,
        cwe: null,
        cve: null
      })
    })

    expect(response.status).toBe(400)
    expect(vulnerabilityService.create).not.toHaveBeenCalled()
  })

  it("maps create failures from the service", async () => {
    const requestId = "vulnerabilities-create-failure-request"
    const payload = {
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: null,
      cwe: null,
      cve: null
    } satisfies typeof createVulnerabilitySchema._output

    vulnerabilityService.create.mockRejectedValueOnce(
      new HTTPException(500, {
        message: "failed to create vulnerability"
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      correlationId: requestId,
      status: 500,
      error: "failed to create vulnerability"
    })
  })

  it("returns a vulnerability by id", async () => {
    const requestId = "vulnerabilities-get-by-id-request"

    vulnerabilityService.getByID.mockResolvedValue(vulnerabilityRecord)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
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
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
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
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
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

  it("returns 200 when updating a vulnerability", async () => {
    const requestId = "vulnerabilities-update-request"
    const payload = {
      title: "Exposed Management Endpoint",
      severity: VulnerabilitySeverity.Critical,
      description: "Management interface is reachable externally",
      cwe: 284,
      cve: "CVE-2026-0001"
    } satisfies typeof updateVulnerabilitySchema._output
    const updatedVulnerability = {
      ...vulnerabilityRecord,
      ...payload,
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    }

    vulnerabilityService.updateByID.mockResolvedValue(updatedVulnerability)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId
        },
        body: JSON.stringify(payload)
      }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(vulnerabilityService.updateByID).toHaveBeenCalledWith({
      id: vulnerabilityId,
      vulnerability: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        ...updatedVulnerability,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
      }
    })
  })

  it("returns 403 when updating a vulnerability without write permission", async () => {
    userHasPermission.mockResolvedValue(false)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "vulnerabilities-update-forbidden-request"
        },
        body: JSON.stringify({
          title: "Exposed Management Endpoint",
          severity: VulnerabilitySeverity.Critical,
          description: null,
          cwe: null,
          cve: null
        })
      }
    )

    expect(response.status).toBe(403)
    expect(userHasPermission).toHaveBeenCalledWith(user.id, {
      vulnerability: ["write"]
    })
    expect(vulnerabilityService.updateByID).not.toHaveBeenCalled()
  })

  it("rejects invalid vulnerability update payloads", async () => {
    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "vulnerabilities-invalid-update-request"
        },
        body: JSON.stringify({
          title: "",
          severity: VulnerabilitySeverity.High,
          description: null,
          cwe: null,
          cve: null
        })
      }
    )

    expect(response.status).toBe(400)
    expect(vulnerabilityService.updateByID).not.toHaveBeenCalled()
  })

  it("returns 404 when updating a missing vulnerability", async () => {
    const requestId = "vulnerabilities-update-missing-request"
    const payload = {
      title: "Exposed Management Endpoint",
      severity: VulnerabilitySeverity.Critical,
      description: null,
      cwe: null,
      cve: null
    } satisfies typeof updateVulnerabilitySchema._output

    vulnerabilityService.updateByID.mockResolvedValue(null)

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      vulnerabilityRoute: createVulnerabilityRoute(
        vulnerabilityService,
        routeDependencies
      )
    })

    const response = await app.request(
      `/api/vulnerabilities/${vulnerabilityId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId
        },
        body: JSON.stringify(payload)
      }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(vulnerabilityService.updateByID).toHaveBeenCalledWith({
      id: vulnerabilityId,
      vulnerability: payload,
      user,
      eventContext: {
        actor: user.id,
        correlationId: requestId
      }
    })
    expect(body).toEqual({
      correlationId: requestId,
      status: 404,
      error: `vulnerability with id ${vulnerabilityId} does not exist`
    })
  })
})
