import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import { AssetType } from "@openvlp/types/model/asset"
import { sql } from "kysely"
import {
  FindingSource,
  FindingStatus,
  type FindingInternal
} from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
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
  const createdBy = "test-user"

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
    await testDb.db.executeQuery(
      sql`
      INSERT INTO "user" (
        "id",
        "name",
        "email",
        "emailVerified",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${createdBy},
        ${"Test User"},
        ${"tester@example.com"},
        ${true},
        ${new Date("2026-01-01T00:00:00.000Z")},
        ${new Date("2026-01-01T00:00:00.000Z")}
      )
    `.compile(testDb.db)
    )
  })

  it("persists, updates, counts, and deletes findings against a real database", async () => {
    const assetRepository = createAssetRepository(testDb.db)
    const vulnerabilityRepository = createVulnerabilityRepository(testDb.db)
    const repository = createFindingRepository(testDb.db)

    const asset = await assetRepository.create({
      id: "",
      name: "api.openvlp.local",
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
      updatedAt: new Date("2026-01-04T00:00:00.000Z")
    }

    const updated = await repository.update(created.id, updatedInput)

    await expect(repository.getByID(created.id)).resolves.toEqual(updated)
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
})
