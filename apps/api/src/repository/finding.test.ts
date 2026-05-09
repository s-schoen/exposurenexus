import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { AssetType } from "@exposurenexus/types/model/asset"
import {
  FindingSource,
  FindingStatus,
  type FindingInternal
} from "@exposurenexus/types/model/finding"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import { createAssetRepository } from "./asset.js"
import { createFindingRepository } from "./finding.js"
import { createVulnerabilityRepository } from "./vulnerability.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("finding repository", () => {
  const testDb = createTestDatabase()
  const createdBy = "85196743-cfba-4afb-b286-d36be32a64a4"
  const assigneeId = "c7f0f5a8-f3e7-4d24-8f72-e3fbc2a48aa6"

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
    await testDb.db
      .insertInto("user_profile")
      .values([
        {
          id: createdBy,
          username: "tester",
          displayName: "Test User",
          email: "tester@example.com",
          enabled: true,
          passwordHash: "password-hash"
        },
        {
          id: assigneeId,
          username: "assignee",
          displayName: "Assigned User",
          email: "assignee@example.com",
          enabled: false,
          passwordHash: "password-hash"
        }
      ])
      .execute()
  })

  it("persists, updates, counts, and deletes findings against a real database", async () => {
    const assetRepository = createAssetRepository(testDb.db)
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db)
    const repository = createFindingRepository(testDb.db)

    const asset = await assetRepository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })
    const vulnerability = await vulnerabilityRepository.create({
      title: "Exposed Admin Endpoint",
      description: "Administrative interface is reachable externally",
      severity: VulnerabilitySeverity.High,
      cve: null,
      cwe: 284,
      createdBy,
      updatedBy: createdBy,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    })

    const findingInput: Omit<FindingInternal, "id"> = {
      assetId: asset.id,
      vulnerabilityId: vulnerability.id,
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      evidence: "Observed exposed admin endpoint",
      source: FindingSource.Manual,
      mitigation: "Restrict access to internal networks",
      assigneeId: null,
      dueDate: new Date("2026-01-10T00:00:00.000Z"),
      firstSeen: new Date("2026-01-03T00:00:00.000Z"),
      lastSeen: new Date("2026-01-03T00:00:00.000Z"),
      fingerprint: "finding-fingerprint",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      createdBy,
      updatedBy: createdBy
    }

    const created = await repository.create(findingInput)

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(created).toMatchObject({
      ...findingInput,
      id: created.id
    })

    await expect(repository.getByID(created.id)).resolves.toEqual(created)
    await expect(
      repository.getByFingerprint("finding-fingerprint")
    ).resolves.toEqual(created)
    await expect(repository.list()).resolves.toEqual([created])

    const updatedInput: Omit<FindingInternal, "id"> = {
      ...created,
      status: FindingStatus.Mitigated,
      mitigation: "Administrative interface restricted to VPN",
      dueDate: null,
      updatedAt: new Date("2026-01-04T00:00:00.000Z")
    }

    const updated = await repository.update(created.id, updatedInput)

    await expect(repository.getByID(created.id)).resolves.toEqual(updated)
    expect(updated.dueDate).toBeNull()
    await expect(repository.countBy("status")).resolves.toEqual({
      [FindingStatus.Mitigated]: 1
    })
    await expect(repository.countBy("severity")).resolves.toEqual({
      [VulnerabilitySeverity.High]: 1
    })
    await expect(repository.countBy("assetId")).resolves.toEqual({
      [asset.id]: 1
    })
    await expect(repository.countBy("source")).resolves.toEqual({
      [FindingSource.Manual]: 1
    })
    await expect(repository.deleteByID(created.id)).resolves.toEqual(updated)
    await expect(repository.getByID(created.id)).resolves.toBeNull()
  })

  it("reclassifies findings matching source and vulnerability only", async () => {
    const assetRepository = createAssetRepository(testDb.db)
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db)
    const repository = createFindingRepository(testDb.db)

    const asset = await assetRepository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })
    const oldVulnerability = await vulnerabilityRepository.create({
      title: "Exposed Admin Endpoint",
      description: "Administrative interface is reachable externally",
      severity: VulnerabilitySeverity.High,
      cve: null,
      cwe: 284,
      createdBy,
      updatedBy: createdBy,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    })
    const targetVulnerability = await vulnerabilityRepository.create({
      title: "Account Takeover",
      description: "Finding should be classified as account takeover",
      severity: VulnerabilitySeverity.Critical,
      cve: null,
      cwe: 287,
      createdBy,
      updatedBy: createdBy,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    })
    const unrelatedVulnerability = await vulnerabilityRepository.create({
      title: "Missing Security Header",
      description: "Header is not present",
      severity: VulnerabilitySeverity.Low,
      cve: null,
      cwe: 693,
      createdBy,
      updatedBy: createdBy,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    })
    const baseFindingInput: Omit<FindingInternal, "id"> = {
      assetId: asset.id,
      vulnerabilityId: oldVulnerability.id,
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      evidence: "Observed exposed admin endpoint",
      source: FindingSource.Nuclei,
      mitigation: "Restrict access to internal networks",
      assigneeId: null,
      dueDate: null,
      firstSeen: new Date("2026-01-03T00:00:00.000Z"),
      lastSeen: new Date("2026-01-03T00:00:00.000Z"),
      fingerprint: "reclassify-matching-finding",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      createdBy,
      updatedBy: createdBy
    }
    const matchingFinding = await repository.create(baseFindingInput)
    const manualFinding = await repository.create({
      ...baseFindingInput,
      source: FindingSource.Manual,
      fingerprint: "reclassify-manual-finding"
    })
    const unrelatedFinding = await repository.create({
      ...baseFindingInput,
      vulnerabilityId: unrelatedVulnerability.id,
      severity: VulnerabilitySeverity.Low,
      fingerprint: "reclassify-unrelated-finding"
    })
    const updatedAt = new Date("2026-01-04T00:00:00.000Z")

    const reclassified = await repository.reclassifyBySourceAndVulnerability({
      source: FindingSource.Nuclei,
      oldVulnerabilityId: oldVulnerability.id,
      targetVulnerabilityId: targetVulnerability.id,
      severity: VulnerabilitySeverity.Critical,
      updatedAt,
      updatedBy: assigneeId
    })

    expect(reclassified).toHaveLength(1)
    expect(reclassified[0]).toMatchObject({
      id: matchingFinding.id,
      source: FindingSource.Nuclei,
      vulnerabilityId: targetVulnerability.id,
      severity: VulnerabilitySeverity.Critical,
      updatedBy: assigneeId
    })
    expect(reclassified[0].updatedAt).toEqual(updatedAt)
    await expect(repository.getByID(matchingFinding.id)).resolves.toMatchObject(
      {
        vulnerabilityId: targetVulnerability.id,
        severity: VulnerabilitySeverity.Critical
      }
    )
    await expect(repository.getByID(manualFinding.id)).resolves.toMatchObject({
      vulnerabilityId: oldVulnerability.id,
      severity: VulnerabilitySeverity.High
    })
    await expect(
      repository.getByID(unrelatedFinding.id)
    ).resolves.toMatchObject({
      vulnerabilityId: unrelatedVulnerability.id,
      severity: VulnerabilitySeverity.Low
    })
  })

  it("clears assignee identity when the assigned user profile is deleted", async () => {
    const assetRepository = createAssetRepository(testDb.db)
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db)
    const repository = createFindingRepository(testDb.db)

    const asset = await assetRepository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })
    const vulnerability = await vulnerabilityRepository.create({
      title: "Exposed Admin Endpoint",
      description: "Administrative interface is reachable externally",
      severity: VulnerabilitySeverity.High,
      cve: null,
      cwe: 284,
      createdBy,
      updatedBy: createdBy,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    })
    const created = await repository.create({
      assetId: asset.id,
      vulnerabilityId: vulnerability.id,
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      evidence: "Observed exposed admin endpoint",
      source: FindingSource.Manual,
      mitigation: "Restrict access to internal networks",
      assigneeId,
      dueDate: null,
      firstSeen: new Date("2026-01-03T00:00:00.000Z"),
      lastSeen: new Date("2026-01-03T00:00:00.000Z"),
      fingerprint: "assigned-finding-fingerprint",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      createdBy,
      updatedBy: createdBy
    })

    expect(created.assigneeId).toBe(assigneeId)

    await testDb.db
      .deleteFrom("user_profile")
      .where("id", "=", assigneeId)
      .execute()

    await expect(repository.getByID(created.id)).resolves.toMatchObject({
      id: created.id,
      assigneeId: null
    })
  })
})
