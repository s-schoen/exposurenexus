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
  })

  it("uses a provided firstSeen value during creation", async () => {
    const service = createFindingService({
      findingRepository,
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
  })

  it("returns null when updating a missing finding", async () => {
    const service = createFindingService({
      findingRepository,
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

  it("creates a finding when the fingerprint does not exist", async () => {
    const service = createFindingService({
      findingRepository,
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
      vulnerabilityService,
      logger
    })

    findingRepository.deleteByID.mockResolvedValue(null)

    await expect(service.deleteByID(baseFinding.id)).resolves.toBeNull()
  })
})
