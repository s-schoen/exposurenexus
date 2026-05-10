import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import {
  FindingSource,
  FindingStatus,
  type FindingInternal
} from "@exposurenexus/types/model/finding"
import { AssetType } from "@exposurenexus/types/model/asset"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import { createDomainEventCollector } from "../test/eventbus.js"
import { createTestUser } from "../test/app.js"
import { createFindingService } from "./finding.js"

describe("finding service", () => {
  const user = createTestUser()
  const assigneeId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
  const logger = pino({ enabled: false })
  const findingRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByFingerprint: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    reclassifyBySourceAndVulnerability: vi.fn(),
    countBy: vi.fn()
  }
  const vulnerabilityService = {
    getByID: vi.fn()
  }
  const assetService = {
    getByID: vi.fn()
  }
  const userProfileService = {
    getByID: vi.fn()
  }
  const domainEvents = createDomainEventCollector()
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
  const createPayload = {
    vulnerabilityId: vulnerability.id,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    source: FindingSource.Manual,
    evidence: "Observed exposed admin endpoint",
    mitigation: "Restrict access to internal networks",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c"
  }
  const updatePayloadBase = {
    severity: createPayload.severity,
    status: createPayload.status,
    source: createPayload.source,
    evidence: createPayload.evidence,
    mitigation: createPayload.mitigation
  }
  const asset = {
    id: createPayload.assetId,
    name: "api.exposurenexus.local",
    type: AssetType.Host,
    ownerId: null
  }
  const baseFinding: FindingInternal = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    ...createPayload,
    assigneeId: null,
    dueDate: null,
    fingerprint: "abc123",
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    assetService.getByID.mockResolvedValue(asset)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)
    domainEvents.clear()
  })

  function createService() {
    return createFindingService({
      findingRepository,
      assetService,
      userProfileService,
      vulnerabilityService,
      domainEventEmitter: domainEvents.emitter,
      logger
    })
  }

  it("lists findings enriched with their vulnerability", async () => {
    const service = createService()

    findingRepository.list.mockResolvedValue([baseFinding])
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(service.listAll()).resolves.toEqual([
      {
        ...baseFinding,
        vulnerability
      }
    ])
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(
      baseFinding.vulnerabilityId
    )
  })

  it("rejects lists containing findings with missing vulnerabilities", async () => {
    const service = createService()

    findingRepository.list.mockResolvedValue([baseFinding])
    vulnerabilityService.getByID.mockResolvedValue(null)

    await expect(service.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list findings"
    } satisfies Partial<HTTPException>)
  })

  it("rejects findings that cannot be enriched with their vulnerability", async () => {
    const service = createService()

    findingRepository.getByID.mockResolvedValue(baseFinding)
    vulnerabilityService.getByID.mockResolvedValue(null)

    await expect(service.getByID(baseFinding.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get finding"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when a finding does not exist", async () => {
    const service = createService()

    findingRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(baseFinding.id)).resolves.toBeNull()
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const service = createService()

    findingRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(baseFinding.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get finding"
    } satisfies Partial<HTTPException>)
  })

  it("creates findings with audit fields, timestamps, and a fingerprint", async () => {
    const service = createService()
    const now = new Date("2026-02-03T04:05:06.000Z")
    const fingerprint = createHash("sha256")
      .update(createPayload.vulnerabilityId)
      .update(createPayload.assetId)
      .update(JSON.stringify({ port: "443", path: "/admin" }))
      .digest("hex")
    const createdFinding = {
      id: baseFinding.id,
      ...createPayload,
      assigneeId: null,
      dueDate: null,
      fingerprint,
      firstSeen: now,
      lastSeen: now,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
      vulnerability
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.create({
        finding: createPayload,
        user,
        fingerprintOptions: { port: "443", path: "/admin" },
        eventContext: {
          actor: user.id,
          correlationId: "findings-create-request"
        }
      })
    ).resolves.toEqual(createdFinding)

    expect(findingRepository.create).toHaveBeenCalledWith({
      ...createPayload,
      assigneeId: null,
      dueDate: null,
      fingerprint,
      firstSeen: now,
      lastSeen: now,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(domainEvents.subjects()).toEqual(["finding.created"])
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.created",
      source: "finding",
      actor: user.id,
      correlationId: "findings-create-request",
      data: {
        finding: createdFinding
      }
    })
  })

  it("creates findings with an explicit null assignee", async () => {
    const service = createService()
    const now = new Date("2026-02-03T04:05:06.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.create({
      finding: {
        ...createPayload,
        assigneeId: null
      },
      user
    })

    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId: null
      })
    )
  })

  it("normalizes finding due dates during creation", async () => {
    const service = createService()
    const dueDate = new Date("2026-05-06T18:30:00.000Z")
    const normalizedDueDate = new Date("2026-05-06T00:00:00.000Z")

    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.create({
      finding: {
        ...createPayload,
        dueDate
      },
      user
    })

    expect(findingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: normalizedDueDate
      })
    )
  })

  it("creates findings with an existing enabled assignee", async () => {
    const service = createService()

    userProfileService.getByID.mockResolvedValue({
      id: assigneeId,
      username: "assignee",
      displayName: "Assigned User",
      email: "assignee@example.com",
      enabled: true,
      roleIds: []
    })
    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.create({
      finding: {
        ...createPayload,
        assigneeId
      },
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("creates findings with an existing disabled assignee", async () => {
    const service = createService()

    userProfileService.getByID.mockResolvedValue({
      id: assigneeId,
      username: "disabled-assignee",
      displayName: "Disabled Assignee",
      email: "disabled-assignee@example.com",
      enabled: false,
      roleIds: []
    })
    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.create({
      finding: {
        ...createPayload,
        assigneeId
      },
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("rejects unknown finding assignees before creating findings", async () => {
    const service = createService()

    userProfileService.getByID.mockResolvedValue(null)

    await expect(
      service.create({
        finding: {
          ...createPayload,
          assigneeId
        },
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding assignee does not exist"
    } satisfies Partial<HTTPException>)
    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("rejects unknown finding assets before creating findings", async () => {
    const service = createService()

    assetService.getByID.mockResolvedValue(null)

    await expect(
      service.create({
        finding: createPayload,
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding asset does not exist"
    } satisfies Partial<HTTPException>)
    expect(assetService.getByID).toHaveBeenCalledWith(createPayload.assetId)
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("rejects unknown finding vulnerabilities before creating findings", async () => {
    const service = createService()

    vulnerabilityService.getByID.mockResolvedValue(null)

    await expect(
      service.create({
        finding: createPayload,
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding vulnerability does not exist"
    } satisfies Partial<HTTPException>)
    expect(vulnerabilityService.getByID).toHaveBeenCalledWith(
      createPayload.vulnerabilityId
    )
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("maps create foreign key failures to an HTTP 400", async () => {
    const service = createService()

    findingRepository.create.mockRejectedValue(
      Object.assign(new Error("violates foreign key constraint"), {
        code: "23503"
      })
    )

    await expect(
      service.create({
        finding: createPayload,
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding references an unknown related resource"
    } satisfies Partial<HTTPException>)
    expect(domainEvents.subjects()).toEqual([])
  })

  it("uses a provided firstSeen value during creation", async () => {
    const service = createService()
    const now = new Date("2026-02-03T04:05:06.000Z")
    const firstSeen = new Date("2026-01-15T00:00:00.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.create({
      finding: createPayload,
      user,
      firstSeen
    })

    expect(findingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstSeen,
        lastSeen: firstSeen,
        createdAt: now,
        updatedAt: now
      })
    )
  })

  it("updates findings while preserving immutable fields", async () => {
    const service = createService()
    const now = new Date("2026-03-04T05:06:07.000Z")
    const updatePayload = {
      ...updatePayloadBase,
      status: FindingStatus.Mitigated,
      mitigation: "Administrative interface restricted to VPN"
    }
    const updatedFinding = {
      ...baseFinding,
      ...updatePayload,
      updatedAt: now,
      updatedBy: user.id
    }
    const previousEventFinding = {
      ...baseFinding,
      vulnerability
    }
    const currentEventFinding = {
      ...updatedFinding,
      vulnerability
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByID.mockResolvedValue(baseFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.updateByID({
        id: baseFinding.id,
        finding: updatePayload,
        user,
        eventContext: {
          actor: user.id,
          correlationId: "findings-update-request"
        }
      })
    ).resolves.toEqual(currentEventFinding)

    expect(findingRepository.updateByID).toHaveBeenCalledWith(baseFinding.id, {
      ...updatePayload,
      assigneeId: baseFinding.assigneeId,
      dueDate: null,
      firstSeen: baseFinding.firstSeen,
      lastSeen: baseFinding.lastSeen,
      assetId: baseFinding.assetId,
      vulnerabilityId: baseFinding.vulnerabilityId,
      createdAt: baseFinding.createdAt,
      createdBy: baseFinding.createdBy,
      fingerprint: baseFinding.fingerprint,
      updatedAt: now,
      updatedBy: user.id
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(domainEvents.subjects()).toEqual(["finding.updated"])
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.updated",
      source: "finding",
      actor: user.id,
      correlationId: "findings-update-request",
      data: {
        previous: previousEventFinding,
        current: currentEventFinding
      }
    })
  })

  it("normalizes finding due dates during updates", async () => {
    const service = createService()
    const dueDate = new Date("2026-05-06T18:30:00.000Z")
    const normalizedDueDate = new Date("2026-05-06T00:00:00.000Z")
    const updatePayload = {
      ...updatePayloadBase,
      dueDate
    }
    const updatedFinding = {
      ...baseFinding,
      dueDate: normalizedDueDate
    }

    findingRepository.getByID.mockResolvedValue(baseFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        dueDate: normalizedDueDate
      })
    )
  })

  it("preserves finding due dates when update payloads omit them", async () => {
    const service = createService()
    const datedFinding = {
      ...baseFinding,
      dueDate: new Date("2026-05-06T00:00:00.000Z")
    }
    const updatedFinding = {
      ...datedFinding,
      status: FindingStatus.Mitigated
    }

    findingRepository.getByID.mockResolvedValue(datedFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: {
        ...updatePayloadBase,
        status: FindingStatus.Mitigated
      },
      user
    })

    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        dueDate: datedFinding.dueDate,
        status: FindingStatus.Mitigated
      })
    )
  })

  it("updates findings to an existing enabled assignee", async () => {
    const service = createService()
    const updatePayload = {
      ...updatePayloadBase,
      assigneeId
    }
    const updatedFinding = {
      ...baseFinding,
      ...updatePayload
    }

    userProfileService.getByID.mockResolvedValue({
      id: assigneeId,
      username: "assignee",
      displayName: "Assigned User",
      email: "assignee@example.com",
      enabled: true,
      roleIds: []
    })
    findingRepository.getByID.mockResolvedValue(baseFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.updateByID({
        id: baseFinding.id,
        finding: updatePayload,
        user
      })
    ).resolves.toEqual({
      ...updatedFinding,
      vulnerability
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("updates findings to an existing disabled assignee", async () => {
    const service = createService()
    const updatePayload = {
      ...updatePayloadBase,
      assigneeId
    }
    const updatedFinding = {
      ...baseFinding,
      ...updatePayload
    }

    userProfileService.getByID.mockResolvedValue({
      id: assigneeId,
      username: "disabled-assignee",
      displayName: "Disabled Assignee",
      email: "disabled-assignee@example.com",
      enabled: false,
      roleIds: []
    })
    findingRepository.getByID.mockResolvedValue(baseFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("reassigns findings from one assignee to another", async () => {
    const service = createService()
    const nextAssigneeId = "98f0b0bb-af64-4d25-ae0d-03629d53444b"
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...updatePayloadBase,
      assigneeId: nextAssigneeId
    }
    const updatedFinding = {
      ...assignedFinding,
      assigneeId: nextAssigneeId
    }

    userProfileService.getByID.mockResolvedValue({
      id: nextAssigneeId,
      username: "next-assignee",
      displayName: "Next Assignee",
      email: "next-assignee@example.com",
      enabled: true,
      roleIds: []
    })
    findingRepository.getByID.mockResolvedValue(assignedFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(nextAssigneeId)
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId: nextAssigneeId
      })
    )
  })

  it("clears finding assignees", async () => {
    const service = createService()
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...updatePayloadBase,
      assigneeId: null
    }
    const updatedFinding = {
      ...assignedFinding,
      assigneeId: null
    }

    findingRepository.getByID.mockResolvedValue(assignedFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId: null
      })
    )
  })

  it("preserves existing assignee when updating finding status", async () => {
    const service = createService()
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...updatePayloadBase,
      status: FindingStatus.Confirmed
    }
    const updatedFinding = {
      ...assignedFinding,
      status: FindingStatus.Confirmed
    }

    findingRepository.getByID.mockResolvedValue(assignedFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.updateByID({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        status: FindingStatus.Confirmed,
        assigneeId
      })
    )
  })

  it("rejects unknown finding assignees before updating findings", async () => {
    const service = createService()
    const updatePayload = {
      ...updatePayloadBase,
      assigneeId
    }

    userProfileService.getByID.mockResolvedValue(null)
    findingRepository.getByID.mockResolvedValue(baseFinding)

    await expect(
      service.updateByID({
        id: baseFinding.id,
        finding: updatePayload,
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding assignee does not exist"
    } satisfies Partial<HTTPException>)
    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.updateByID).not.toHaveBeenCalled()
  })

  it("returns null when updating a missing finding", async () => {
    const service = createService()

    findingRepository.getByID.mockResolvedValue(null)

    await expect(
      service.updateByID({
        id: baseFinding.id,
        finding: updatePayloadBase,
        user
      })
    ).resolves.toBeNull()
    expect(findingRepository.updateByID).not.toHaveBeenCalled()
    expect(domainEvents.subjects()).toEqual([])
  })

  it("updates lastSeen instead of creating when the fingerprint already exists", async () => {
    const service = createService()
    const now = new Date("2026-04-05T06:07:08.000Z")
    const existingFinding = {
      ...baseFinding,
      lastSeen: new Date("2026-01-20T00:00:00.000Z")
    }
    const updatedFinding = {
      ...existingFinding,
      lastSeen: now
    }
    const previousEventFinding = {
      ...existingFinding,
      vulnerability
    }
    const currentEventFinding = {
      ...updatedFinding,
      vulnerability
    }
    const fingerprint = createHash("sha256")
      .update(createPayload.vulnerabilityId)
      .update(createPayload.assetId)
      .update(JSON.stringify({ port: "443" }))
      .digest("hex")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByFingerprint.mockResolvedValue(existingFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate({
        finding: createPayload,
        user,
        fingerprintOptions: { port: "443" },
        eventContext: {
          actor: user.id,
          correlationId: "findings-import-request"
        }
      })
    ).resolves.toEqual({
      finding: currentEventFinding,
      created: false
    })

    expect(findingRepository.getByFingerprint).toHaveBeenCalledWith(fingerprint)
    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      existingFinding.id,
      {
        ...existingFinding,
        lastSeen: now
      }
    )
    expect(findingRepository.create).not.toHaveBeenCalled()
    expect(domainEvents.subjects()).toEqual(["finding.updated"])
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.updated",
      source: "finding",
      actor: user.id,
      correlationId: "findings-import-request",
      data: {
        previous: previousEventFinding,
        current: currentEventFinding
      }
    })
  })

  it("preserves existing assignment and due date when an imported finding dedupes", async () => {
    const service = createService()
    const now = new Date("2026-04-05T06:07:08.000Z")
    const dueDate = new Date("2026-05-06T00:00:00.000Z")
    const existingFinding = {
      ...baseFinding,
      assigneeId,
      dueDate,
      source: FindingSource.Nuclei,
      lastSeen: new Date("2026-01-20T00:00:00.000Z")
    }
    const updatedFinding = {
      ...existingFinding,
      lastSeen: now
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByFingerprint.mockResolvedValue(existingFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate({
        finding: {
          ...createPayload,
          source: FindingSource.Nuclei,
          assigneeId: null,
          dueDate: null
        },
        user
      })
    ).resolves.toEqual({
      finding: {
        ...updatedFinding,
        vulnerability
      },
      created: false
    })

    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      existingFinding.id,
      {
        ...existingFinding,
        lastSeen: now
      }
    )
    expect(findingRepository.updateByID.mock.calls[0]?.[1]).toMatchObject({
      assigneeId,
      dueDate,
      source: FindingSource.Nuclei,
      lastSeen: now
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("reopens inactive imported findings while preserving their due date", async () => {
    const service = createService()
    const now = new Date("2026-04-05T06:07:08.000Z")
    const dueDate = new Date("2026-05-06T00:00:00.000Z")
    const existingFinding = {
      ...baseFinding,
      dueDate,
      status: FindingStatus.Inactive,
      source: FindingSource.Nuclei,
      lastSeen: new Date("2026-01-20T00:00:00.000Z")
    }
    const updatedFinding = {
      ...existingFinding,
      status: FindingStatus.Active,
      lastSeen: now
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByFingerprint.mockResolvedValue(existingFinding)
    findingRepository.updateByID.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate({
        finding: {
          ...createPayload,
          source: FindingSource.Nuclei,
          status: FindingStatus.Active,
          assigneeId: null,
          dueDate: null
        },
        user
      })
    ).resolves.toEqual({
      finding: {
        ...updatedFinding,
        vulnerability
      },
      created: false
    })

    expect(findingRepository.updateByID).toHaveBeenCalledWith(
      existingFinding.id,
      {
        ...existingFinding,
        status: FindingStatus.Active,
        lastSeen: now
      }
    )
    expect(findingRepository.updateByID.mock.calls[0]?.[1]).toMatchObject({
      dueDate,
      status: FindingStatus.Active,
      lastSeen: now
    })
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("creates undated imported findings when the fingerprint does not exist", async () => {
    const service = createService()
    const now = new Date("2026-04-05T06:07:08.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByFingerprint.mockResolvedValue(null)
    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate({
        finding: {
          ...createPayload,
          source: FindingSource.Nuclei,
          assigneeId: null,
          dueDate: null
        },
        user
      })
    ).resolves.toEqual({
      finding: {
        id: baseFinding.id,
        ...createPayload,
        source: FindingSource.Nuclei,
        assigneeId: null,
        dueDate: null,
        fingerprint: createHash("sha256")
          .update(createPayload.vulnerabilityId)
          .update(createPayload.assetId)
          .digest("hex"),
        firstSeen: now,
        lastSeen: now,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now,
        updatedAt: now,
        vulnerability
      },
      created: true
    })

    expect(findingRepository.create.mock.calls[0]?.[0]).toMatchObject({
      source: FindingSource.Nuclei,
      assigneeId: null,
      dueDate: null
    })
  })

  it("reclassifies findings from one vulnerability to another by source", async () => {
    const service = createService()
    const now = new Date("2026-05-01T02:03:04.000Z")
    const targetVulnerability = {
      ...vulnerability,
      id: "4fb566c6-e642-48d8-b70d-418efb074f8d",
      title: "Account Takeover",
      severity: VulnerabilitySeverity.Critical
    }
    const updatedFinding = {
      ...baseFinding,
      source: FindingSource.Nuclei,
      vulnerabilityId: targetVulnerability.id,
      severity: targetVulnerability.severity,
      updatedAt: now,
      updatedBy: user.id
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    vulnerabilityService.getByID.mockImplementation(async (id) => {
      if (id === vulnerability.id) return vulnerability
      if (id === targetVulnerability.id) return targetVulnerability
      return null
    })
    findingRepository.reclassifyBySourceAndVulnerability.mockResolvedValue([
      updatedFinding
    ])

    await expect(
      service.reclassify({
        reclassification: {
          source: FindingSource.Nuclei,
          oldVulnerabilityId: vulnerability.id,
          targetVulnerabilityId: targetVulnerability.id
        },
        user,
        eventContext: {
          actor: user.id,
          correlationId: "findings-reclassify-request"
        }
      })
    ).resolves.toEqual({
      updatedCount: 1
    })

    expect(
      findingRepository.reclassifyBySourceAndVulnerability
    ).toHaveBeenCalledWith({
      source: FindingSource.Nuclei,
      oldVulnerabilityId: vulnerability.id,
      targetVulnerabilityId: targetVulnerability.id,
      severity: VulnerabilitySeverity.Critical,
      updatedAt: now,
      updatedBy: user.id
    })
    expect(domainEvents.subjects()).toEqual(["finding.reclassified"])
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.reclassified",
      source: "finding",
      actor: user.id,
      correlationId: "findings-reclassify-request",
      data: {
        source: FindingSource.Nuclei,
        oldVulnerabilityId: vulnerability.id,
        targetVulnerabilityId: targetVulnerability.id,
        updatedCount: 1
      }
    })
  })

  it("rejects reclassification when the old vulnerability does not exist", async () => {
    const service = createService()
    const targetVulnerability = {
      ...vulnerability,
      id: "4fb566c6-e642-48d8-b70d-418efb074f8d"
    }

    vulnerabilityService.getByID.mockImplementation(async (id) =>
      id === targetVulnerability.id ? targetVulnerability : null
    )

    await expect(
      service.reclassify({
        reclassification: {
          source: FindingSource.Nuclei,
          oldVulnerabilityId: vulnerability.id,
          targetVulnerabilityId: targetVulnerability.id
        },
        user
      })
    ).rejects.toMatchObject({
      status: 404,
      message: `old vulnerability with id ${vulnerability.id} does not exist`
    } satisfies Partial<HTTPException>)
    expect(
      findingRepository.reclassifyBySourceAndVulnerability
    ).not.toHaveBeenCalled()
  })

  it("rejects reclassification when the target vulnerability does not exist", async () => {
    const service = createService()
    const targetVulnerabilityId = "4fb566c6-e642-48d8-b70d-418efb074f8d"

    vulnerabilityService.getByID.mockImplementation(async (id) =>
      id === vulnerability.id ? vulnerability : null
    )

    await expect(
      service.reclassify({
        reclassification: {
          source: FindingSource.Nuclei,
          oldVulnerabilityId: vulnerability.id,
          targetVulnerabilityId
        },
        user
      })
    ).rejects.toMatchObject({
      status: 404,
      message: `target vulnerability with id ${targetVulnerabilityId} does not exist`
    } satisfies Partial<HTTPException>)
    expect(
      findingRepository.reclassifyBySourceAndVulnerability
    ).not.toHaveBeenCalled()
  })

  it("maps reclassification repository failures to an HTTP 500", async () => {
    const service = createService()
    const targetVulnerability = {
      ...vulnerability,
      id: "4fb566c6-e642-48d8-b70d-418efb074f8d"
    }

    vulnerabilityService.getByID.mockImplementation(async (id) => {
      if (id === vulnerability.id) return vulnerability
      if (id === targetVulnerability.id) return targetVulnerability
      return null
    })
    findingRepository.reclassifyBySourceAndVulnerability.mockRejectedValue(
      new Error("db offline")
    )

    await expect(
      service.reclassify({
        reclassification: {
          source: FindingSource.Nuclei,
          oldVulnerabilityId: vulnerability.id,
          targetVulnerabilityId: targetVulnerability.id
        },
        user
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to reclassify findings"
    } satisfies Partial<HTTPException>)
  })

  it("deletes a finding and returns it enriched with its vulnerability", async () => {
    const service = createService()

    findingRepository.deleteByID.mockResolvedValue(baseFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.deleteByID(baseFinding.id, {
        actor: user.id,
        correlationId: "findings-delete-request"
      })
    ).resolves.toEqual({
      ...baseFinding,
      vulnerability
    })
    expect(domainEvents.subjects()).toEqual(["finding.deleted"])
    expect(domainEvents.events[0]).toMatchObject({
      subject: "finding.deleted",
      source: "finding",
      actor: user.id,
      correlationId: "findings-delete-request",
      data: {
        finding: {
          ...baseFinding,
          vulnerability
        }
      }
    })
  })

  it("returns null when deleting a missing finding", async () => {
    const service = createService()

    findingRepository.deleteByID.mockResolvedValue(null)

    await expect(service.deleteByID(baseFinding.id)).resolves.toBeNull()
    expect(domainEvents.subjects()).toEqual([])
  })
})
