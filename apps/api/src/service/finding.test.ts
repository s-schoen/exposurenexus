import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  FindingSource,
  FindingStatus,
  type FindingInternal
} from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import { createTestUser } from "../test/app.js"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../repository/finding.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByFingerprint: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByID: vi.fn()
}))

vi.mock("../service/vulnerability.js", () => ({
  getByID: vi.fn()
}))

import * as findingRepository from "../repository/finding.js"
import * as vulnerabilityService from "../service/vulnerability.js"
import * as findingService from "./finding.js"

describe("finding service", () => {
  const user = createTestUser()
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
    vi.mocked(findingRepository.list).mockResolvedValue([baseFinding])
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await expect(findingService.listAll()).resolves.toEqual([
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
    vi.mocked(findingRepository.getByID).mockResolvedValue(baseFinding)
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(null)

    await expect(findingService.getByID(baseFinding.id)).resolves.toEqual(
      baseFinding
    )
  })

  it("returns null when a finding does not exist", async () => {
    vi.mocked(findingRepository.getByID).mockResolvedValue(null)

    await expect(findingService.getByID(baseFinding.id)).resolves.toBeNull()
    expect(vulnerabilityService.getByID).not.toHaveBeenCalled()
  })

  it("maps repository get failures to an HTTP 500", async () => {
    vi.mocked(findingRepository.getByID).mockRejectedValue(
      new Error("db offline")
    )

    await expect(findingService.getByID(baseFinding.id)).rejects.toMatchObject({
      status: 500,
      message: "failed to get finding"
    } satisfies Partial<HTTPException>)
  })

  it("creates findings with audit fields, timestamps, and a fingerprint", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z")
    const fingerprint = createHash("sha256")
      .update(createPayload.vulnerabilityId)
      .update(createPayload.assetId)
      .update(JSON.stringify({ port: "443", path: "/admin" }))
      .digest("hex")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    vi.mocked(findingRepository.create).mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await expect(
      findingService.create(
        {
          finding: createPayload,
          user
        },
        { port: "443", path: "/admin" }
      )
    ).resolves.toEqual({
      id: baseFinding.id,
      ...createPayload,
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
    const now = new Date("2026-02-03T04:05:06.000Z")
    const firstSeen = new Date("2026-01-15T00:00:00.000Z")

    vi.useFakeTimers()
    vi.setSystemTime(now)

    vi.mocked(findingRepository.create).mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await findingService.create({
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

    vi.mocked(findingRepository.getByID).mockResolvedValue(baseFinding)
    vi.mocked(findingRepository.update).mockResolvedValue(updatedFinding)
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await expect(
      findingService.update({
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
    vi.mocked(findingRepository.getByID).mockResolvedValue(null)

    await expect(
      findingService.update({
        id: baseFinding.id,
        finding: createPayload,
        user
      })
    ).resolves.toBeNull()
    expect(findingRepository.update).not.toHaveBeenCalled()
  })

  it("updates lastSeen instead of creating when the fingerprint already exists", async () => {
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

    vi.mocked(findingRepository.getByFingerprint).mockResolvedValue(
      existingFinding
    )
    vi.mocked(findingRepository.update).mockResolvedValue(updatedFinding)
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await expect(
      findingService.createOrUpdate(
        {
          finding: createPayload,
          user
        },
        { port: "443" }
      )
    ).resolves.toEqual({
      created: false,
      finding: {
        ...updatedFinding,
        vulnerability
      }
    })

    expect(findingRepository.getByFingerprint).toHaveBeenCalledWith(fingerprint)
    expect(findingRepository.update).toHaveBeenCalledWith(
      existingFinding.id,
      expect.objectContaining({
        id: existingFinding.id,
        lastSeen: now
      })
    )
  })

  it("creates a new finding when no fingerprint match exists", async () => {
    vi.mocked(findingRepository.getByFingerprint).mockResolvedValue(null)
    vi.mocked(findingRepository.create).mockImplementation(async (input) => ({
      id: baseFinding.id,
      ...input
    }))
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    const result = await findingService.createOrUpdate({
      finding: createPayload,
      user
    })

    expect(result.created).toBe(true)
    expect(findingRepository.create).toHaveBeenCalledOnce()
  })

  it("deletes a finding by id with vulnerability enrichment", async () => {
    vi.mocked(findingRepository.deleteByID).mockResolvedValue(baseFinding)
    vi.mocked(vulnerabilityService.getByID).mockResolvedValue(vulnerability)

    await expect(findingService.deleteByID(baseFinding.id)).resolves.toEqual({
      ...baseFinding,
      vulnerability
    })
  })

  it("maps repository delete failures to an HTTP 500", async () => {
    vi.mocked(findingRepository.deleteByID).mockRejectedValue(
      new Error("delete failed")
    )

    await expect(
      findingService.deleteByID(baseFinding.id)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get finding"
    } satisfies Partial<HTTPException>)
  })
})
