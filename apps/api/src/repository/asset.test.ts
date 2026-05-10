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
  FindingStatus
} from "@exposurenexus/types/model/finding"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import { createAssetRepository } from "./asset.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

describe("asset repository", () => {
  const testDb = createTestDatabase()
  const createdBy = "85196743-cfba-4afb-b286-d36be32a64a4"

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
      .values({
        id: createdBy,
        username: "tester",
        displayName: "Test User",
        email: "tester@example.com",
        enabled: true,
        passwordHash: "password-hash"
      })
      .execute()
  })

  it("persists and retrieves assets against a real database", async () => {
    const repository = createAssetRepository(testDb.db)
    const created = await repository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(created.name).toBe("api.exposurenexus.local")
    expect(created.type).toBe(AssetType.Host)
    expect(created.ownerId).toBeNull()

    await expect(repository.getByID(created.id)).resolves.toEqual(created)
    await expect(
      repository.getByName("api.exposurenexus.local", AssetType.Host)
    ).resolves.toEqual(created)
    await expect(repository.list()).resolves.toEqual([created])
  })

  it("stores nullable asset owners and clears them when the user profile is deleted", async () => {
    const repository = createAssetRepository(testDb.db)
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12"

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: ownerId,
        username: "owner",
        displayName: "Asset Owner",
        email: "owner@example.com",
        enabled: false,
        passwordHash: "hash-owner"
      })
      .execute()

    const ownedAsset = await repository.create({
      id: "",
      name: "owned.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    })
    const ownerlessAsset = await repository.create({
      id: "",
      name: "ownerless.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    })

    expect(ownedAsset.ownerId).toBe(ownerId)
    expect(ownerlessAsset.ownerId).toBeNull()

    await testDb.db
      .deleteFrom("user_profile")
      .where("id", "=", ownerId)
      .execute()

    await expect(repository.getByID(ownedAsset.id)).resolves.toMatchObject({
      id: ownedAsset.id,
      ownerId: null
    })
  })

  it("updates and clears asset owners", async () => {
    const repository = createAssetRepository(testDb.db)
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12"

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: ownerId,
        username: "owner",
        displayName: "Asset Owner",
        email: "owner@example.com",
        enabled: false,
        passwordHash: "hash-owner"
      })
      .execute()

    const asset = await repository.create({
      id: "",
      name: "owned.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    })

    await expect(
      repository.updateOwnerByID(asset.id, ownerId)
    ).resolves.toMatchObject({
      id: asset.id,
      ownerId
    })
    await expect(repository.updateOwnerByID(asset.id, null)).resolves.toEqual({
      ...asset,
      ownerId: null
    })
    await expect(
      repository.updateOwnerByID("76b1885f-2d28-4b7d-93da-2751ff385aa3", null)
    ).resolves.toBeNull()
  })

  it("does not delete assets linked to findings", async () => {
    const repository = createAssetRepository(testDb.db)
    const asset = await repository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })
    const vulnerability = await testDb.db
      .insertInto("vulnerability")
      .values({
        title: "Exposed Admin Endpoint",
        description: "Administrative interface is reachable externally",
        severity: VulnerabilitySeverity.High,
        cve: null,
        cwe: 284,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        createdBy,
        updatedBy: createdBy
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    const finding = await testDb.db
      .insertInto("finding")
      .values({
        assetId: asset.id,
        vulnerabilityId: vulnerability.id,
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        evidence: "Observed exposed admin endpoint",
        source: FindingSource.Manual,
        mitigation: "Restrict access to internal networks",
        assigneeId: null,
        dueDate: null,
        firstSeen: new Date("2026-01-03T00:00:00.000Z"),
        lastSeen: new Date("2026-01-03T00:00:00.000Z"),
        fingerprint: "asset-delete-blocked-finding",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        createdBy,
        updatedBy: createdBy
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await expect(repository.countFindingsByAssetID(asset.id)).resolves.toBe(1)
    await expect(repository.deleteByID(asset.id)).rejects.toThrow(
      /foreign key|violates/i
    )
    await expect(repository.getByID(asset.id)).resolves.toEqual(asset)
    await expect(
      testDb.db
        .selectFrom("finding")
        .selectAll()
        .where("id", "=", finding.id)
        .executeTakeFirst()
    ).resolves.toMatchObject({
      id: finding.id,
      assetId: asset.id
    })
  })
})
