import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { AssetType } from "@openvlp/types/model/asset"
import { pino } from "pino"
import {
  FindingSource,
  FindingStatus,
  type Finding
} from "@openvlp/types/model/finding"
import {
  VulnerabilitySeverity,
  type Vulnerability,
  type VulnerabilitySourceMapping
} from "@openvlp/types/model/vulnerability"
import { createTestUser } from "../test/app.js"
import { createNucleiFindingParser } from "./nuclei.js"

describe("nuclei importer", () => {
  const user = createTestUser()
  const ctx = {
    user,
    eventContext: {
      actor: user.id,
      correlationId: "findings-import-request"
    }
  }
  const logger = pino({ enabled: false })
  const vulnerabilityService = {
    listMappings: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    createMapping: vi.fn()
  }
  const findingService = {
    createOrUpdate: vi.fn()
  }
  const getOrCreateAsset = vi.fn()
  const vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  }
  const asset = {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    name: "api.openvlp.local",
    type: AssetType.Host,
    ownerId: null
  }
  const nucleiFinding = {
    "template-id": "admin-panel",
    info: {
      name: "Exposed Admin Endpoint",
      description: "Administrative interface is reachable externally",
      remediation: "Restrict access to internal networks",
      severity: "high"
    },
    type: "http",
    host: "api.openvlp.local:443",
    port: "443",
    path: "/admin",
    request: "GET /admin HTTP/1.1",
    response: "HTTP/1.1 200 OK",
    "curl-command": "curl https://api.openvlp.local/admin",
    timestamp: "2026-01-02T03:04:05+00:00"
  }
  const finding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    source: FindingSource.Nuclei,
    status: FindingStatus.Active,
    vulnerabilityId: vulnerability.id,
    assetId: asset.id,
    severity: vulnerability.severity,
    evidence: "evidence",
    mitigation: nucleiFinding.info.remediation,
    assigneeId: null,
    dueDate: null,
    fingerprint: "abc123",
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    vulnerability
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("creates or updates findings for mapped vulnerabilities", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}'
      }
    ] as VulnerabilitySourceMapping[])
    vulnerabilityService.getByID.mockResolvedValue(
      vulnerability as Vulnerability
    )
    getOrCreateAsset.mockResolvedValue(asset)
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true
    })

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(`${JSON.stringify(nucleiFinding)}\n`)
    )

    expect(result).toEqual([finding])
    expect(vulnerabilityService.create).not.toHaveBeenCalled()
    expect(vulnerabilityService.createMapping).not.toHaveBeenCalled()
    expect(getOrCreateAsset).toHaveBeenCalledWith(
      AssetType.Host,
      "api.openvlp.local",
      ctx.eventContext
    )
    expect(findingService.createOrUpdate).toHaveBeenCalledWith(
      {
        user,
        finding: {
          source: FindingSource.Nuclei,
          status: FindingStatus.Active,
          vulnerabilityId: vulnerability.id,
          assetId: asset.id,
          severity: vulnerability.severity,
          evidence: expect.stringContaining("GET /admin HTTP/1.1"),
          mitigation: "Restrict access to internal networks",
          assigneeId: null,
          dueDate: null
        },
        firstSeen: expect.any(Date),
        eventContext: ctx.eventContext
      },
      {
        port: "443",
        path: "/admin"
      }
    )
  })

  it("creates vulnerabilities and mappings when no mapping exists", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    vulnerabilityService.listMappings.mockResolvedValue([])
    vulnerabilityService.create.mockResolvedValue(
      vulnerability as Vulnerability
    )
    vulnerabilityService.createMapping.mockResolvedValue({
      id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
      vulnerabilityId: vulnerability.id,
      source: FindingSource.Nuclei,
      matchQuery: '{"templateID":"admin-panel"}'
    } as VulnerabilitySourceMapping)
    getOrCreateAsset.mockResolvedValue(asset)
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true
    })

    await parser.parseNucleiFindings(
      ctx,
      Buffer.from(`${JSON.stringify(nucleiFinding)}\n`)
    )

    expect(vulnerabilityService.create).toHaveBeenCalledWith({
      user,
      eventContext: ctx.eventContext,
      vulnerability: {
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cve: "",
        cwe: 0
      }
    })
    expect(vulnerabilityService.createMapping).toHaveBeenCalledWith({
      vulnerabilityId: vulnerability.id,
      source: FindingSource.Nuclei,
      matchQuery: '{"templateID":"admin-panel"}',
      eventContext: ctx.eventContext
    })
  })

  it("skips findings without a host", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    vulnerabilityService.listMappings.mockResolvedValue([])

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          host: undefined
        })}\n`
      )
    )

    expect(result).toEqual([])
    expect(getOrCreateAsset).not.toHaveBeenCalled()
    expect(findingService.createOrUpdate).not.toHaveBeenCalled()
  })

  it("skips findings when a new vulnerability cannot be named", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    vulnerabilityService.listMappings.mockResolvedValue([])

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          info: {
            ...nucleiFinding.info,
            name: undefined
          }
        })}\n`
      )
    )

    expect(result).toEqual([])
    expect(vulnerabilityService.create).not.toHaveBeenCalled()
    expect(getOrCreateAsset).not.toHaveBeenCalled()
  })

  it("throws a 400 HTTP exception when a line cannot be parsed", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    await expect(
      parser.parseNucleiFindings(ctx, Buffer.from("{not-json}\n"))
    ).rejects.toMatchObject({
      status: 400,
      message: "failed to parse line 1"
    } satisfies Partial<HTTPException>)
  })

  it("returns empty evidence when the request body is missing", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      getOrCreateAsset,
      logger
    })

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}'
      }
    ] as VulnerabilitySourceMapping[])
    vulnerabilityService.getByID.mockResolvedValue(
      vulnerability as Vulnerability
    )
    getOrCreateAsset.mockResolvedValue(asset)
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true
    })

    await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          request: undefined,
          response: undefined,
          "curl-command": undefined
        })}\n`
      )
    )

    expect(findingService.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        finding: expect.objectContaining({
          evidence: "",
          assigneeId: null,
          dueDate: null
        })
      }),
      {
        port: "443",
        path: "/admin"
      }
    )
  })
})
