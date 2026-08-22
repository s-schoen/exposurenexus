import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createAssetRepository } from "./asset.js";

import type { CreateAssetRecord } from "./asset.js";

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {},
}));

describe("asset repository", () => {
  const testDb = createTestDatabase();
  const createdBy = "85196743-cfba-4afb-b286-d36be32a64a4";

  function createAssetRecord(overrides: Partial<CreateAssetRecord> = {}): CreateAssetRecord {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");

    return {
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
      updatedBy: createdBy,
      ...overrides,
    };
  }

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: createdBy,
        username: "tester",
        displayName: "Test User",
        email: "tester@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  it("persists and retrieves the expanded asset shape", async () => {
    const repository = createAssetRepository(testDb.db);
    const created = await repository.create(createAssetRecord());

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.displayName).toBe("api.exposurenexus.local");
    expect(created.type).toBe(AssetType.Host);
    expect(created.environment).toBe(AssetEnvironment.Production);
    expect(created.lifecycleState).toBe(AssetLifecycleState.Active);
    expect(created.ownerId).toBeNull();
    expect(created.identifiers).toEqual([]);
    expect(created.createdBy).toBe(createdBy);
    expect(created.updatedBy).toBe(createdBy);

    await expect(repository.getByID(created.id)).resolves.toEqual(created);
    await expect(
      repository.getByDisplayName("api.exposurenexus.local", AssetType.Host),
    ).resolves.toEqual(created);
    await expect(repository.list()).resolves.toEqual([created]);
  });

  it("filters by display name, identifiers, core metadata, and nullable owners", async () => {
    const repository = createAssetRepository(testDb.db);
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: ownerId,
        username: "asset-owner",
        displayName: "Asset Owner",
        email: "asset-owner@example.com",
        enabled: false,
        passwordHash: "owner-password-hash",
      })
      .execute();

    const matching = await repository.create(
      createAssetRecord({
        displayName: "Duplicate asset",
        ownerId,
        identifiers: [
          {
            type: AssetIdentifierType.IpAddress,
            namespace: null,
            value: "192.0.2.10",
          },
          {
            type: AssetIdentifierType.DnsName,
            namespace: "internal",
            value: "api.example.com",
          },
        ],
      }),
    );
    const archivedDuplicate = await repository.create(
      createAssetRecord({
        displayName: "Duplicate asset",
        lifecycleState: AssetLifecycleState.Archived,
        identifiers: [
          {
            type: AssetIdentifierType.DnsName,
            namespace: null,
            value: "archived.example.com",
          },
        ],
      }),
    );
    const nonHostDuplicate = await repository.create(
      createAssetRecord({
        displayName: "Duplicate asset",
        type: AssetType.Software,
      }),
    );
    const unidentified = await repository.create(
      createAssetRecord({
        displayName: "Unidentified software",
        type: AssetType.Software,
        ownerId,
      }),
    );
    await repository.create(
      createAssetRecord({
        displayName: "Different asset",
        environment: AssetEnvironment.Staging,
        ownerId,
        identifiers: [
          {
            type: AssetIdentifierType.IpAddress,
            namespace: null,
            value: "192.0.2.11",
          },
        ],
      }),
    );

    await expect(
      repository.list({
        search: "192.0.2.10",
        types: [AssetType.Host],
        environments: [AssetEnvironment.Production],
        ownerIds: [ownerId],
      }),
    ).resolves.toEqual([matching]);
    await expect(repository.list({ search: "duplicate" })).resolves.toEqual([
      matching,
      archivedDuplicate,
      nonHostDuplicate,
    ]);
    await expect(repository.listByDisplayName("Duplicate asset", AssetType.Host)).resolves.toEqual(
      expect.arrayContaining([matching, archivedDuplicate]),
    );
    await expect(
      repository.listByDisplayName("Duplicate asset", AssetType.Host),
    ).resolves.toHaveLength(2);
    await expect(
      repository.listByDisplayName("Duplicate asset", AssetType.Software),
    ).resolves.toEqual([nonHostDuplicate]);
    await expect(repository.list({ ownerIds: [null] })).resolves.toEqual([
      archivedDuplicate,
      nonHostDuplicate,
    ]);
    await expect(repository.list({ search: "unidentified" })).resolves.toEqual([unidentified]);
  });

  it("applies each inventory filter independently", async () => {
    const repository = createAssetRepository(testDb.db);
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: ownerId,
        username: "inventory-owner",
        displayName: "Inventory Owner",
        email: "inventory-owner@example.com",
        enabled: true,
        passwordHash: "owner-password-hash",
      })
      .execute();

    const ownedHost = await repository.create(
      createAssetRecord({
        displayName: "Owned host",
        ownerId,
        identifiers: [
          { type: AssetIdentifierType.IpAddress, namespace: null, value: "192.0.2.20" },
          { type: AssetIdentifierType.DnsName, namespace: null, value: "api.second.example.com" },
        ],
      }),
    );
    const ownedSoftware = await repository.create(
      createAssetRecord({ displayName: "Owned software", type: AssetType.Software, ownerId }),
    );
    const archivedHost = await repository.create(
      createAssetRecord({
        displayName: "Archived host",
        lifecycleState: AssetLifecycleState.Archived,
        ownerId,
      }),
    );
    const stagingHost = await repository.create(
      createAssetRecord({
        displayName: "Staging host",
        environment: AssetEnvironment.Staging,
        ownerId,
      }),
    );
    const ownerlessHost = await repository.create(
      createAssetRecord({ displayName: "Ownerless host" }),
    );

    await expect(repository.list({ types: [AssetType.Software] })).resolves.toEqual([
      ownedSoftware,
    ]);
    await expect(repository.list({ environments: [AssetEnvironment.Staging] })).resolves.toEqual([
      stagingHost,
    ]);
    await expect(
      repository.list({ lifecycleStates: [AssetLifecycleState.Archived] }),
    ).resolves.toEqual([archivedHost]);
    await expect(repository.list({ ownerIds: [ownerId] })).resolves.toEqual([
      ownedHost,
      ownedSoftware,
      archivedHost,
      stagingHost,
    ]);
    await expect(repository.list({ ownerIds: [null, ownerId] })).resolves.toEqual([
      ownedHost,
      ownedSoftware,
      archivedHost,
      stagingHost,
      ownerlessHost,
    ]);
    await expect(repository.list({ search: "  API.SECOND.EXAMPLE.COM  " })).resolves.toEqual([
      ownedHost,
    ]);
  });

  it("stores nullable asset owners and clears them when the user profile is deleted", async () => {
    const repository = createAssetRepository(testDb.db);
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";

    await testDb.db
      .insertInto("user_profile")
      .values({
        id: ownerId,
        username: "owner",
        displayName: "Asset Owner",
        email: "owner@example.com",
        enabled: false,
        passwordHash: "hash-owner",
      })
      .execute();

    const ownedAsset = await repository.create(
      createAssetRecord({ displayName: "owned.exposurenexus.local", ownerId }),
    );
    const ownerlessAsset = await repository.create(
      createAssetRecord({ displayName: "ownerless.exposurenexus.local" }),
    );

    expect(ownedAsset.ownerId).toBe(ownerId);
    expect(ownerlessAsset.ownerId).toBeNull();

    await testDb.db.deleteFrom("user_profile").where("id", "=", ownerId).execute();

    await expect(repository.getByID(ownedAsset.id)).resolves.toMatchObject({
      id: ownedAsset.id,
      ownerId: null,
    });
  });

  it("updates core metadata and audit fields", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(createAssetRecord());
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");

    await expect(
      repository.updateByID(asset.id, {
        displayName: "renamed.exposurenexus.local",
        type: AssetType.CloudResource,
        environment: AssetEnvironment.Staging,
        lifecycleState: AssetLifecycleState.Archived,
        ownerId: null,
        updatedAt,
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({
      ...asset,
      displayName: "renamed.exposurenexus.local",
      type: AssetType.CloudResource,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      updatedAt,
    });
    await expect(
      repository.updateByID("76b1885f-2d28-4b7d-93da-2751ff385aa3", {
        ownerId: null,
        updatedAt,
        updatedBy: createdBy,
      }),
    ).resolves.toBeNull();
  });

  it("preserves omitted fields during partial asset updates", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(
      createAssetRecord({
        displayName: "api.exposurenexus.local",
        type: AssetType.CloudResource,
        environment: AssetEnvironment.Staging,
        lifecycleState: AssetLifecycleState.Archived,
        ownerId: createdBy,
        identifiers: [
          {
            type: AssetIdentifierType.CloudResourceId,
            namespace: "prod",
            value: "resource-1",
          },
        ],
      }),
    );
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");

    await expect(
      repository.updateByID(asset.id, {
        displayName: "renamed.exposurenexus.local",
        updatedAt,
        updatedBy: createdBy,
      }),
    ).resolves.toEqual({
      ...asset,
      displayName: "renamed.exposurenexus.local",
      updatedAt,
    });
  });

  it("persists identifiers in deterministic order and keeps their ids stable", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(
      createAssetRecord({
        identifiers: [
          {
            type: AssetIdentifierType.CloudResourceId,
            namespace: "prod",
            value: "resource-2",
          },
          {
            type: AssetIdentifierType.DnsName,
            namespace: null,
            value: "api.example.com",
          },
          {
            type: AssetIdentifierType.CloudResourceId,
            namespace: null,
            value: "resource-1",
          },
        ],
      }),
    );

    expect(
      asset.identifiers.map(({ type, namespace, value }) => ({ type, namespace, value })),
    ).toEqual([
      {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
      },
      {
        type: AssetIdentifierType.CloudResourceId,
        namespace: null,
        value: "resource-1",
      },
      {
        type: AssetIdentifierType.CloudResourceId,
        namespace: "prod",
        value: "resource-2",
      },
    ]);

    const identifier = asset.identifiers[0]!;
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    await expect(
      repository.updateIdentifierByID(
        asset.id,
        identifier.id,
        {
          type: identifier.type,
          namespace: "archive",
          value: identifier.value,
        },
        { updatedAt, updatedBy: createdBy },
      ),
    ).resolves.toMatchObject({ id: identifier.id, namespace: "archive" });
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({
      updatedAt,
      identifiers: expect.arrayContaining([expect.objectContaining({ id: identifier.id })]),
    });
  });

  it("enforces identifier identity uniqueness across archived assets and cascades on deletion", async () => {
    const repository = createAssetRepository(testDb.db);
    const identifier = {
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const first = await repository.create(createAssetRecord({ identifiers: [identifier] }));
    const archived = await repository.create(
      createAssetRecord({
        displayName: "archived.example.com",
        lifecycleState: AssetLifecycleState.Archived,
      }),
    );

    await expect(
      repository.addIdentifier(archived.id, identifier, {
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).rejects.toThrow(/unique|duplicate/i);
    await expect(repository.getAssetIDByIdentifier(identifier)).resolves.toBe(first.id);

    await expect(repository.deleteByID(first.id)).resolves.toMatchObject({
      id: first.id,
      identifiers: [expect.objectContaining(identifier)],
    });
    await expect(repository.getAssetIDByIdentifier(identifier)).resolves.toBeNull();
  });

  it("scopes identifier identity by namespace", async () => {
    const repository = createAssetRepository(testDb.db);
    const identifier = {
      type: AssetIdentifierType.DnsName,
      value: "api.example.com",
    } as const;
    const networkA = await repository.create(
      createAssetRecord({
        displayName: "Network A",
        identifiers: [{ ...identifier, namespace: "network-a" }],
      }),
    );
    const networkB = await repository.create(
      createAssetRecord({
        displayName: "Network B",
        identifiers: [{ ...identifier, namespace: "network-b" }],
      }),
    );
    const global = await repository.create(
      createAssetRecord({
        displayName: "Global",
        identifiers: [{ ...identifier, namespace: null }],
      }),
    );

    await expect(
      repository.getAssetIDByIdentifier({ ...identifier, namespace: "network-a" }),
    ).resolves.toBe(networkA.id);
    await expect(
      repository.getAssetIDByIdentifier({ ...identifier, namespace: "network-b" }),
    ).resolves.toBe(networkB.id);
    await expect(
      repository.getAssetIDByIdentifier({ ...identifier, namespace: null }),
    ).resolves.toBe(global.id);
    await expect(
      repository.addIdentifier(
        networkB.id,
        { ...identifier, namespace: "network-a" },
        {
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          updatedBy: createdBy,
        },
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("adds and removes identifiers while auditing the parent asset", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(createAssetRecord());
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    const identifier = {
      type: AssetIdentifierType.IpAddress,
      namespace: "private",
      value: "192.0.2.1",
    } as const;

    const added = await repository.addIdentifier(asset.id, identifier, {
      updatedAt,
      updatedBy: createdBy,
    });
    expect(added).toMatchObject(identifier);
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({
      updatedAt,
      identifiers: [expect.objectContaining(identifier)],
    });

    await expect(
      repository.deleteIdentifierByID(asset.id, added!.id, {
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedBy: createdBy,
      }),
    ).resolves.toMatchObject({ id: added!.id });
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({ identifiers: [] });
  });

  it("rolls back identifier mutations when parent audit updates fail", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(createAssetRecord());
    const invalidAudit = {
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedBy: "00000000-0000-0000-0000-000000000000",
    };
    const identifier = {
      type: AssetIdentifierType.IpAddress,
      namespace: "private",
      value: "192.0.2.1",
    } as const;

    await expect(repository.addIdentifier(asset.id, identifier, invalidAudit)).rejects.toThrow();
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({ identifiers: [] });

    const added = await repository.addIdentifier(asset.id, identifier, {
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedBy: createdBy,
    });
    expect(added).not.toBeNull();

    await expect(
      repository.updateIdentifierByID(
        asset.id,
        added!.id,
        { ...identifier, value: "192.0.2.2" },
        invalidAudit,
      ),
    ).rejects.toThrow();
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({
      identifiers: [expect.objectContaining(identifier)],
    });

    await expect(
      repository.deleteIdentifierByID(asset.id, added!.id, invalidAudit),
    ).rejects.toThrow();
    await expect(repository.getByID(asset.id)).resolves.toMatchObject({
      identifiers: [expect.objectContaining(identifier)],
    });
  });

  it("does not delete assets linked to findings", async () => {
    const repository = createAssetRepository(testDb.db);
    const asset = await repository.create(createAssetRecord());
    const vulnerability = await testDb.db
      .insertInto("vulnerability")
      .values({
        title: "Exposed Admin Endpoint",
        description: "Administrative interface is reachable externally",
        type: VulnerabilityType.Cwe,
        identifier: "CWE-284",
        severity: VulnerabilitySeverity.High,
        metadata: null,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        createdBy,
        updatedBy: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const finding = await testDb.db
      .insertInto("finding")
      .values({
        assetId: asset.id,
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        mitigation: "Restrict access to internal networks",
        assigneeId: null,
        dueDate: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        createdBy,
        updatedBy: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await testDb.db
      .insertInto("finding_vulnerability")
      .values({ findingId: finding.id, vulnerabilityId: vulnerability.id })
      .execute();

    await expect(repository.countFindingsByAssetID(asset.id)).resolves.toBe(1);
    await expect(repository.deleteByID(asset.id)).rejects.toThrow(/foreign key|violates/i);
    await expect(repository.getByID(asset.id)).resolves.toEqual(asset);
    await expect(
      testDb.db.selectFrom("finding").selectAll().where("id", "=", finding.id).executeTakeFirst(),
    ).resolves.toMatchObject({
      id: finding.id,
      assetId: asset.id,
    });
  });
});
