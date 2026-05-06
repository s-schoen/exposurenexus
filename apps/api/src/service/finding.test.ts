import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import {
  FindingSource,
  FindingStatus,
  type FindingInternal
} from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
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
    update: vi.fn(),
    deleteByID: vi.fn()
  }
  const vulnerabilityService = {
    getByID: vi.fn()
  }
  const userProfileService = {
    getByID: vi.fn()
  }
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
  const baseFinding: FindingInternal = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    ...createPayload,
    assigneeId: null,
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
  })

  it("lists findings enriched with their vulnerability", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

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

  it("returns a finding without enrichment when the vulnerability cannot be found", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.getByID.mockResolvedValue(baseFinding)
    vulnerabilityService.getByID.mockResolvedValue(null)

    await expect(service.getByID(baseFinding.id)).resolves.toEqual(baseFinding)
  })

  it("returns null when a finding does not exist", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.getByID.mockResolvedValue(null)

    await expect(service.getByID(baseFinding.id)).resolves.toBeNull()
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.getByID.mockRejectedValue(new Error("db offline"))

    await expect(service.getByID(baseFinding.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get finding"
    } satisfies Partial<HTTPException>)
  })

  it("creates findings with audit fields, timestamps, and a fingerprint", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const now = new Date("2026-02-03T04:05:06.000Z")
    const fingerprint = createHash("sha256")
      .update(createPayload.vulnerabilityId)
      .update(createPayload.assetId)
      .update(JSON.stringify({ port: "443", path: "/admin" }))
      .digest("hex")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.create.mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.create(
        {
          finding: createPayload,
          user
        },
        { port: "443", path: "/admin" }
      )
    ).resolves.toEqual({
      id: baseFinding.id,
      ...createPayload,
      assigneeId: null,
      fingerprint,
      firstSeen: now,
      lastSeen: now,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
      vulnerability
    })

    expect(findingRepository.create).toHaveBeenCalledWith({
      ...createPayload,
      assigneeId: null,
      fingerprint,
      firstSeen: now,
      lastSeen: now,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
  })

  it("creates findings with an explicit null assignee", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
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

  it("creates findings with an existing enabled assignee", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

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
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

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
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

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

  it("uses a provided firstSeen value during creation", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
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
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const now = new Date("2026-03-04T05:06:07.000Z")
    const updatePayload = {
      ...createPayload,
      status: FindingStatus.Mitigated,
      mitigation: "Administrative interface restricted to VPN"
    }
    const updatedFinding = {
      ...baseFinding,
      ...updatePayload,
      updatedAt: now,
      updatedBy: user.id
    }

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByID.mockResolvedValue(baseFinding)
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.update({
        id: baseFinding.id,
        finding: updatePayload,
        user
      })
    ).resolves.toEqual({
      ...updatedFinding,
      vulnerability
    })

    expect(findingRepository.update).toHaveBeenCalledWith(baseFinding.id, {
      ...updatePayload,
      assigneeId: baseFinding.assigneeId,
      firstSeen: baseFinding.firstSeen,
      lastSeen: baseFinding.lastSeen,
      createdAt: baseFinding.createdAt,
      createdBy: baseFinding.createdBy,
      fingerprint: baseFinding.fingerprint,
      updatedAt: now,
      updatedBy: user.id
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
  })

  it("updates findings to an existing enabled assignee", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const updatePayload = {
      ...createPayload,
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
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.update({
        id: baseFinding.id,
        finding: updatePayload,
        user
      })
    ).resolves.toEqual({
      ...updatedFinding,
      vulnerability
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.update).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("updates findings to an existing disabled assignee", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const updatePayload = {
      ...createPayload,
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
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.update({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.update).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId
      })
    )
  })

  it("reassigns findings from one assignee to another", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const nextAssigneeId = "98f0b0bb-af64-4d25-ae0d-03629d53444b"
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...createPayload,
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
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.update({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).toHaveBeenCalledWith(nextAssigneeId)
    expect(findingRepository.update).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId: nextAssigneeId
      })
    )
  })

  it("clears finding assignees", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...createPayload,
      assigneeId: null
    }
    const updatedFinding = {
      ...assignedFinding,
      assigneeId: null
    }

    findingRepository.getByID.mockResolvedValue(assignedFinding)
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.update({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.update).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        assigneeId: null
      })
    )
  })

  it("preserves existing assignee when updating finding status", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const assignedFinding = {
      ...baseFinding,
      assigneeId
    }
    const updatePayload = {
      ...createPayload,
      status: FindingStatus.Confirmed
    }
    const updatedFinding = {
      ...assignedFinding,
      status: FindingStatus.Confirmed
    }

    findingRepository.getByID.mockResolvedValue(assignedFinding)
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await service.update({
      id: baseFinding.id,
      finding: updatePayload,
      user
    })

    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.update).toHaveBeenCalledWith(
      baseFinding.id,
      expect.objectContaining({
        status: FindingStatus.Confirmed,
        assigneeId
      })
    )
  })

  it("rejects unknown finding assignees before updating findings", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const updatePayload = {
      ...createPayload,
      assigneeId
    }

    userProfileService.getByID.mockResolvedValue(null)
    findingRepository.getByID.mockResolvedValue(baseFinding)

    await expect(
      service.update({
        id: baseFinding.id,
        finding: updatePayload,
        user
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "finding assignee does not exist"
    } satisfies Partial<HTTPException>)
    expect(userProfileService.getByID).toHaveBeenCalledWith(assigneeId)
    expect(findingRepository.update).not.toHaveBeenCalled()
  })

  it("returns null when updating a missing finding", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.getByID.mockResolvedValue(null)

    await expect(
      service.update({
        id: baseFinding.id,
        finding: createPayload,
        user
      })
    ).resolves.toBeNull()
    expect(findingRepository.update).not.toHaveBeenCalled()
  })

  it("updates lastSeen instead of creating when the fingerprint already exists", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const now = new Date("2026-04-05T06:07:08.000Z")
    const existingFinding = {
      ...baseFinding,
      lastSeen: new Date("2026-01-20T00:00:00.000Z")
    }
    const updatedFinding = {
      ...existingFinding,
      lastSeen: now
    }
    const fingerprint = createHash("sha256")
      .update(createPayload.vulnerabilityId)
      .update(createPayload.assetId)
      .update(JSON.stringify({ port: "443" }))
      .digest("hex")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    findingRepository.getByFingerprint.mockResolvedValue(existingFinding)
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate(
        {
          finding: createPayload,
          user
        },
        { port: "443" }
      )
    ).resolves.toEqual({
      finding: {
        ...updatedFinding,
        vulnerability
      },
      created: false
    })

    expect(findingRepository.getByFingerprint).toHaveBeenCalledWith(fingerprint)
    expect(findingRepository.update).toHaveBeenCalledWith(existingFinding.id, {
      ...existingFinding,
      lastSeen: now
    })
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("preserves an existing assignee when an imported finding dedupes", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
    const now = new Date("2026-04-05T06:07:08.000Z")
    const existingFinding = {
      ...baseFinding,
      assigneeId,
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
    findingRepository.update.mockResolvedValue(updatedFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(
      service.createOrUpdate({
        finding: {
          ...createPayload,
          source: FindingSource.Nuclei,
          assigneeId: null
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

    expect(findingRepository.update).toHaveBeenCalledWith(existingFinding.id, {
      ...existingFinding,
      lastSeen: now
    })
    expect(findingRepository.update.mock.calls[0]?.[1]).toMatchObject({
      assigneeId,
      source: FindingSource.Nuclei,
      lastSeen: now
    })
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(findingRepository.create).not.toHaveBeenCalled()
  })

  it("creates a finding when the fingerprint does not exist", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })
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
        finding: createPayload,
        user
      })
    ).resolves.toEqual({
      finding: {
        id: baseFinding.id,
        ...createPayload,
        assigneeId: null,
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
  })

  it("deletes a finding and returns it enriched with its vulnerability", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.deleteByID.mockResolvedValue(baseFinding)
    vulnerabilityService.getByID.mockResolvedValue(vulnerability)

    await expect(service.deleteByID(baseFinding.id)).resolves.toEqual({
      ...baseFinding,
      vulnerability
    })
  })

  it("returns null when deleting a missing finding", async () => {
    const service = createFindingService({
      findingRepository,
      userProfileService,
      vulnerabilityService,
      logger
    })

    findingRepository.deleteByID.mockResolvedValue(null)

    await expect(service.deleteByID(baseFinding.id)).resolves.toBeNull()
  })
})
