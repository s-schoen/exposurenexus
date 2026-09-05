import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
  type CreateAsset,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { sql } from "kysely";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../database/test/database.js";
import { createBackendRuntime } from "../runtime.js";
import { createAssets } from "./assets.js";

const auditUserId = "85196743-cfba-4afb-b286-d36be32a64a4";

describe("assets capability persistence", () => {
  const testDb = createTestDatabase();
  const logger = pino({ enabled: false });

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
        id: auditUserId,
        username: "assets-persistence-tester",
        displayName: "Assets Persistence Tester",
        email: "assets-persistence@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  function createCapability() {
    return createAssets(createBackendRuntime({ database: testDb.db, logger }));
  }

  async function createAsset(overrides: Partial<CreateAsset> = {}) {
    return await createCapability().inventory.create({
      asset: {
        displayName: "api.exposurenexus.local",
        type: AssetType.Host,
        environment: AssetEnvironment.Production,
        lifecycleState: AssetLifecycleState.Active,
        identifiers: [],
        ...overrides,
      },
      performedBy: auditUserId,
    });
  }

  it("combines inventory filters while treating ownerless assets as an alternative owner", async () => {
    const inventory = createCapability().inventory;
    const otherOwner = await testDb.db
      .insertInto("user_profile")
      .values({
        username: "other-owner",
        displayName: "Other Owner",
        email: "other@example.com",
        enabled: false,
        passwordHash: "password-hash",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const owned = await createAsset({ ownerId: auditUserId });
    const ownerless = await createAsset();
    await createAsset({ ownerId: otherOwner.id });
    await createAsset({ type: AssetType.Software, ownerId: auditUserId });
    await createAsset({ environment: AssetEnvironment.Staging, ownerId: auditUserId });
    await createAsset({ lifecycleState: AssetLifecycleState.Archived, ownerId: auditUserId });

    const filters = {
      types: [AssetType.Host],
      environments: [AssetEnvironment.Production],
      lifecycleStates: [AssetLifecycleState.Active],
    };
    await expect(inventory.listAll({ ...filters, ownerIds: [auditUserId] })).resolves.toEqual([
      owned.asset,
    ]);
    await expect(inventory.listAll({ ...filters, ownerIds: [null] })).resolves.toEqual([
      ownerless.asset,
    ]);
    const both = await inventory.listAll({ ...filters, ownerIds: [auditUserId, null] });
    expect(both).toHaveLength(2);
    expect(both).toEqual(expect.arrayContaining([owned.asset, ownerless.asset]));
    await expect(
      inventory.listAll({
        types: [],
        environments: [],
        lifecycleStates: [],
        ownerIds: [],
        search: "  ",
      }),
    ).resolves.toHaveLength(6);
  });

  it("searches display names and identifiers case-insensitively with literal substrings", async () => {
    const inventory = createCapability().inventory;
    const named = await createAsset({ displayName: "API_100%" });
    const identified = await createAsset({
      displayName: "Gateway",
      identifiers: [
        { type: AssetIdentifierType.DnsName, namespace: null, value: "api.example.com" },
        { type: AssetIdentifierType.DnsName, namespace: null, value: "api.internal.example.com" },
      ],
    });
    await createAsset({ displayName: "Unrelated" });
    const matches = await inventory.listAll({ search: "  API  " });
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(expect.arrayContaining([named.asset, identified.asset]));
    await expect(inventory.listAll({ search: "_100%" })).resolves.toEqual([named.asset]);
    await expect(inventory.listAll({ search: "missing" })).resolves.toEqual([]);
  });

  it("allows duplicate display names and narrows exact-name lookups by asset type", async () => {
    const inventory = createCapability().inventory;
    const host = await createAsset({ displayName: "Shared" });
    const software = await createAsset({ displayName: "Shared", type: AssetType.Software });
    await createAsset({ displayName: "Shared suffix" });

    const matches = await inventory.listByDisplayName("Shared");
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(expect.arrayContaining([host.asset, software.asset]));
    await expect(inventory.listByDisplayName("Shared", AssetType.Host)).resolves.toEqual([
      host.asset,
    ]);
    await expect(inventory.getByDisplayName("Shared", AssetType.Software)).resolves.toEqual(
      software.asset,
    );
    expect(matches).toContainEqual(await inventory.getByDisplayName("Shared"));
    await expect(inventory.getByDisplayName("Shared", AssetType.CloudResource)).resolves.toBeNull();
    await expect(inventory.listByDisplayName("missing")).resolves.toEqual([]);
  });

  it("persists partial asset edits, explicit owner clearing, and unchanged audit facts for no-ops", async () => {
    const inventory = createCapability().inventory;
    const created = await createAsset();
    const updated = await inventory.updateByID({
      id: created.asset.id,
      asset: {
        displayName: " Renamed service ",
        type: AssetType.Software,
        environment: AssetEnvironment.Staging,
        lifecycleState: AssetLifecycleState.Archived,
        ownerId: auditUserId,
      },
      performedBy: auditUserId,
    });
    expect(updated).toMatchObject({
      changed: true,
      previous: created.current,
      current: {
        displayName: "Renamed service",
        type: AssetType.Software,
        environment: AssetEnvironment.Staging,
        lifecycleState: AssetLifecycleState.Archived,
        ownerId: auditUserId,
        createdAt: created.asset.createdAt,
        createdBy: auditUserId,
        updatedBy: auditUserId,
      },
    });
    await expect(inventory.getByID(created.asset.id)).resolves.toEqual(updated!.asset);
    const cleared = await inventory.updateByID({
      id: created.asset.id,
      asset: { ownerId: null },
      performedBy: auditUserId,
    });
    expect(cleared!.asset).toEqual({
      ...updated!.asset,
      ownerId: null,
      updatedAt: expect.any(Date),
    });
    await expect(
      inventory.updateByID({
        id: created.asset.id,
        asset: { ownerId: null },
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({
      changed: false,
      previous: cleared!.current,
      current: cleared!.current,
    });
    await expect(inventory.getByID(created.asset.id)).resolves.toEqual(cleared!.asset);
  });

  it.each([null, "private"])(
    "rolls back asset creation when an archived asset owns the identifier in namespace %s",
    async (namespace) => {
      const inventory = createCapability().inventory;
      const identifier = { type: AssetIdentifierType.DnsName, namespace, value: "api.example.com" };
      const existing = await createAsset({
        lifecycleState: AssetLifecycleState.Archived,
        identifiers: [identifier],
      });
      await expect(
        createAsset({ displayName: "Rejected", identifiers: [identifier] }),
      ).rejects.toMatchObject({
        code: "asset.identifier_conflict",
        kind: "conflict",
        details: { conflictingAssetId: existing.asset.id },
      });
      await expect(inventory.listAll()).resolves.toEqual([existing.asset]);
      const scoped = await createAsset({ identifiers: [{ ...identifier, namespace: "Private" }] });
      expect(scoped.asset.identifiers).toMatchObject([
        { namespace: "Private", value: "api.example.com" },
      ]);
    },
  );

  it("does not mutate an identifier through another asset", async () => {
    const inventory = createCapability().inventory;
    const source = await createAsset({
      identifiers: [
        { type: AssetIdentifierType.DnsName, namespace: null, value: "api.example.com" },
      ],
    });
    const other = await createAsset();
    const command = {
      assetId: other.asset.id,
      identifierId: source.asset.identifiers[0]!.id,
      performedBy: auditUserId,
    };
    await expect(
      inventory.updateIdentifierByID({
        ...command,
        identifier: {
          type: AssetIdentifierType.DnsName,
          namespace: null,
          value: "changed.example.com",
        },
      }),
    ).resolves.toBeNull();
    await expect(inventory.deleteIdentifierByID(command)).resolves.toBeNull();
    await expect(inventory.getByID(source.asset.id)).resolves.toEqual(source.asset);
    await expect(inventory.getByID(other.asset.id)).resolves.toEqual(other.asset);
  });

  it("hydrates batch custom fields without leaking assignments or overrides between assets", async () => {
    const assets = createCapability();
    const first = await createAsset({ displayName: "First" });
    const second = await createAsset({ displayName: "Second" });
    const unassigned = await createAsset({ displayName: "Unassigned" });
    const tier = await assets.customFields.createDefinition({
      definition: {
        key: "tier",
        name: "Tier",
        type: AssetCustomFieldType.Select,
        required: false,
        defaultValue: "standard",
        options: [
          { value: "standard", label: "Standard" },
          { value: "critical", label: "Critical" },
        ],
      },
      performedBy: auditUserId,
    });
    const capacity = await assets.customFields.createDefinition({
      definition: {
        key: "capacity",
        name: "Capacity",
        type: AssetCustomFieldType.Number,
        required: false,
        defaultValue: 10,
      },
      performedBy: auditUserId,
    });
    for (const asset of [first, second]) {
      await assets.customFields.replaceAssignmentsForAsset({
        assetId: asset.asset.id,
        fieldIds: [tier.current.id, capacity.current.id],
        performedBy: auditUserId,
      });
    }
    await assets.customFields.replaceValuesForAsset({
      assetId: first.asset.id,
      values: [
        { fieldId: tier.current.id, value: "critical" },
        { fieldId: capacity.current.id, value: 0 },
      ],
      performedBy: auditUserId,
    });

    const values = await assets.customFields.listEffectiveValuesForAssets([
      first.asset.id,
      second.asset.id,
      unassigned.asset.id,
    ]);
    expect(values.size).toBe(3);
    expect(values.get(first.asset.id)).toMatchObject([
      { fieldId: capacity.current.id, value: 0, source: AssetCustomFieldValueSource.Asset },
      {
        fieldId: tier.current.id,
        value: "critical",
        source: AssetCustomFieldValueSource.Asset,
        options: [
          { value: "critical", label: "Critical" },
          { value: "standard", label: "Standard" },
        ],
      },
    ]);
    expect(values.get(second.asset.id)).toMatchObject([
      { fieldId: capacity.current.id, value: 10, source: AssetCustomFieldValueSource.Default },
      {
        fieldId: tier.current.id,
        value: "standard",
        source: AssetCustomFieldValueSource.Default,
        options: [
          { value: "critical", label: "Critical" },
          { value: "standard", label: "Standard" },
        ],
      },
    ]);
    expect(values.get(unassigned.asset.id)).toEqual([]);
    for (const asset of [first, second, unassigned]) {
      await expect(
        assets.customFields.listEffectiveValuesForAsset(asset.asset.id),
      ).resolves.toEqual(values.get(asset.asset.id));
    }
    const hydrated = await assets.inventory.listAllWithCustomFields({ search: "First" });
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({
      id: first.asset.id,
      customFields: values.get(first.asset.id),
    });
  });

  it("lists unassigned definitions per asset and clears text overrides back to empty values", async () => {
    const assets = createCapability();
    const first = await createAsset();
    const second = await createAsset();
    const text = await assets.customFields.createDefinition({
      definition: {
        key: "notes",
        name: "Notes",
        type: AssetCustomFieldType.Text,
        required: false,
        defaultValue: null,
      },
      performedBy: auditUserId,
    });
    const select = await assets.customFields.createDefinition({
      definition: {
        key: "category",
        name: "Category",
        type: AssetCustomFieldType.Select,
        required: false,
        defaultValue: "service",
        options: [{ value: "service", label: "Service" }],
      },
      performedBy: auditUserId,
    });
    await assets.customFields.replaceAssignmentsForAsset({
      assetId: first.asset.id,
      fieldIds: [text.current.id],
      performedBy: auditUserId,
    });
    await expect(
      assets.customFields.listAvailableDefinitionsForAsset(first.asset.id),
    ).resolves.toEqual([select.current]);
    await expect(
      assets.customFields.listAvailableDefinitionsForAsset(second.asset.id),
    ).resolves.toEqual([select.current, text.current]);
    await expect(assets.customFields.listDefinitions()).resolves.toEqual([
      select.current,
      text.current,
    ]);
    await assets.customFields.replaceValuesForAsset({
      assetId: first.asset.id,
      values: [{ fieldId: text.current.id, value: "Override" }],
      performedBy: auditUserId,
    });
    await assets.customFields.replaceValuesForAsset({
      assetId: first.asset.id,
      values: [{ fieldId: text.current.id, value: null }],
      performedBy: auditUserId,
    });
    await expect(
      assets.customFields.listEffectiveValuesForAssets([first.asset.id]),
    ).resolves.toEqual(
      new Map([
        [
          first.asset.id,
          [
            {
              fieldId: text.current.id,
              key: "notes",
              name: "Notes",
              type: AssetCustomFieldType.Text,
              value: null,
              source: AssetCustomFieldValueSource.Empty,
            },
          ],
        ],
      ]),
    );
  });

  it("handles empty inventories and assets with no custom-field definitions", async () => {
    const assets = createCapability();
    await expect(assets.inventory.listAllWithCustomFields()).resolves.toEqual([]);
    await expect(assets.customFields.listEffectiveValuesForAssets([])).resolves.toEqual(new Map());
    await expect(assets.customFields.listDefinitions()).resolves.toEqual([]);
    const created = await createAsset();
    await expect(assets.inventory.listAllWithCustomFields()).resolves.toEqual([created.current]);
    await expect(
      assets.customFields.listAvailableDefinitionsForAsset(created.asset.id),
    ).resolves.toEqual([]);
  });

  it("returns null for metadata and identifier mutations on a missing asset", async () => {
    const inventory = createCapability().inventory;
    const id = "5ae5fb17-4d54-43f6-b85c-02c0a087f503";
    const identifier = {
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    };
    await expect(
      inventory.updateByID({ id, asset: { displayName: "Missing" }, performedBy: auditUserId }),
    ).resolves.toBeNull();
    await expect(
      inventory.addIdentifier({ assetId: id, identifier, performedBy: auditUserId }),
    ).resolves.toBeNull();
    await expect(
      inventory.updateIdentifierByID({
        assetId: id,
        identifierId: id,
        identifier,
        performedBy: auditUserId,
      }),
    ).resolves.toBeNull();
    await expect(
      inventory.deleteIdentifierByID({ assetId: id, identifierId: id, performedBy: auditUserId }),
    ).resolves.toBeNull();
  });

  it.each(["add", "update"] as const)(
    "preserves both assets when identifier %s conflicts with an existing owner",
    async (operation) => {
      const inventory = createCapability().inventory;
      const identifier = {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
      };
      const owner = await createAsset({ identifiers: [identifier] });
      const target = await createAsset({
        identifiers: [{ ...identifier, value: "other.example.com" }],
      });
      const command = { assetId: target.asset.id, identifier, performedBy: auditUserId };
      await expect(
        operation === "add"
          ? inventory.addIdentifier(command)
          : inventory.updateIdentifierByID({
              ...command,
              identifierId: target.asset.identifiers[0]!.id,
            }),
      ).rejects.toMatchObject({
        code: "asset.identifier_conflict",
        details: { conflictingAssetId: owner.asset.id },
      });
      await expect(inventory.getByID(owner.asset.id)).resolves.toEqual(owner.asset);
      await expect(inventory.getByID(target.asset.id)).resolves.toEqual(target.asset);
    },
  );

  it("removes all custom-field assignments and discards overrides before reassignment", async () => {
    const assets = createCapability();
    const created = await createAsset();
    const field = await assets.customFields.createDefinition({
      definition: {
        key: "notes",
        name: "Notes",
        type: AssetCustomFieldType.Text,
        required: false,
        defaultValue: "Default",
      },
      performedBy: auditUserId,
    });
    await assets.customFields.replaceAssignmentsForAsset({
      assetId: created.asset.id,
      fieldIds: [field.current.id],
      performedBy: auditUserId,
    });
    await assets.customFields.replaceValuesForAsset({
      assetId: created.asset.id,
      values: [{ fieldId: field.current.id, value: "Old override" }],
      performedBy: auditUserId,
    });
    await expect(
      assets.customFields.replaceAssignmentsForAsset({
        assetId: created.asset.id,
        fieldIds: [],
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ changed: true, current: { customFields: [] } });
    const reassigned = await assets.customFields.replaceAssignmentsForAsset({
      assetId: created.asset.id,
      fieldIds: [field.current.id],
      performedBy: auditUserId,
    });
    expect(reassigned!.values).toMatchObject([
      { value: "Default", source: AssetCustomFieldValueSource.Default },
    ]);
    await expect(
      assets.customFields.replaceValuesForAsset({
        assetId: created.asset.id,
        values: [{ fieldId: field.current.id, value: null }],
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({
      changed: false,
      previous: reassigned!.current,
      current: reassigned!.current,
    });
  });

  it.each(["metadata", "identifier_update", "identifier_delete"] as const)(
    "rolls back %s when asset audit persistence fails",
    async (operation) => {
      const inventory = createCapability().inventory;
      const identifier = {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
      };
      const created = await createAsset({ identifiers: [identifier] });
      const command = {
        assetId: created.asset.id,
        identifierId: created.asset.identifiers[0]!.id,
        performedBy: auditUserId,
      };
      const operations = {
        metadata: () =>
          inventory.updateByID({
            id: created.asset.id,
            asset: { displayName: "Rejected" },
            performedBy: auditUserId,
          }),
        identifier_update: () =>
          inventory.updateIdentifierByID({
            ...command,
            identifier: { ...identifier, value: "changed.example.com" },
          }),
        identifier_delete: () => inventory.deleteIdentifierByID(command),
      };
      const codes = {
        metadata: "asset.update_failed",
        identifier_update: "asset.identifier_update_failed",
        identifier_delete: "asset.identifier_delete_failed",
      };
      await expect(withFailingAssetAudit<unknown>(operations[operation])).rejects.toMatchObject({
        code: codes[operation],
        kind: "unexpected",
      });
      await expect(inventory.getByID(created.asset.id)).resolves.toEqual(created.asset);
    },
  );

  async function withFailingAssetAudit<T>(action: () => Promise<T>): Promise<T> {
    await sql`
      CREATE FUNCTION fail_assets_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'asset audit update failed';
      END;
      $$
    `.execute(testDb.db);
    await sql`
      CREATE TRIGGER fail_assets_audit_trigger
      BEFORE UPDATE ON asset
      FOR EACH ROW EXECUTE FUNCTION fail_assets_audit()
    `.execute(testDb.db);

    try {
      return await action();
    } finally {
      await sql`DROP TRIGGER fail_assets_audit_trigger ON asset`.execute(testDb.db);
      await sql`DROP FUNCTION fail_assets_audit`.execute(testDb.db);
    }
  }

  it("keeps asset mutations and hydrated projections on the capability seam", async () => {
    const assets = createCapability();
    const created = await assets.inventory.create({
      asset: {
        displayName: "api.exposurenexus.local",
        type: AssetType.Host,
        identifiers: [
          {
            type: AssetIdentifierType.DnsName,
            namespace: null,
            value: "api.example.com",
          },
        ],
      },
      performedBy: auditUserId,
    });

    expect(created.current).toMatchObject({
      id: created.asset.id,
      identifiers: [
        expect.objectContaining({
          type: AssetIdentifierType.DnsName,
          value: "api.example.com",
        }),
      ],
      customFields: [],
    });
    await expect(assets.inventory.getByID(created.asset.id)).resolves.toEqual(created.asset);

    const addedIdentifier = await assets.inventory.addIdentifier({
      assetId: created.asset.id,
      identifier: {
        type: AssetIdentifierType.IpAddress,
        namespace: null,
        value: "192.0.2.10",
      },
      performedBy: auditUserId,
    });
    expect(addedIdentifier?.current.identifiers).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "192.0.2.10" })]),
    );

    const updatedIdentifier = await assets.inventory.updateIdentifierByID({
      assetId: created.asset.id,
      identifierId: addedIdentifier!.identifier.id,
      identifier: {
        type: AssetIdentifierType.IpAddress,
        namespace: "private",
        value: "192.0.2.11",
      },
      performedBy: auditUserId,
    });
    expect(updatedIdentifier?.current.identifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: addedIdentifier!.identifier.id,
          namespace: "private",
          value: "192.0.2.11",
        }),
      ]),
    );

    await expect(
      assets.inventory.deleteIdentifierByID({
        assetId: created.asset.id,
        identifierId: addedIdentifier!.identifier.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ identifier: { id: addedIdentifier!.identifier.id } });

    const category = await assets.customFields.createDefinition({
      definition: {
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: "platform",
      },
      performedBy: auditUserId,
    });
    const priority = await assets.customFields.createDefinition({
      definition: {
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: null,
      },
      performedBy: auditUserId,
    });

    const assignment = await assets.customFields.replaceAssignmentsForAsset({
      assetId: created.asset.id,
      fieldIds: [priority.current.id, category.current.id],
      performedBy: auditUserId,
    });
    expect(assignment?.values).toMatchObject([
      {
        fieldId: category.current.id,
        source: AssetCustomFieldValueSource.Default,
        value: "platform",
      },
      {
        fieldId: priority.current.id,
        source: AssetCustomFieldValueSource.Empty,
        value: null,
      },
    ]);

    const updated = await assets.customFields.replaceValuesForAsset({
      assetId: created.asset.id,
      values: [
        { fieldId: priority.current.id, value: 3 },
        { fieldId: category.current.id, value: "service" },
      ],
      performedBy: auditUserId,
    });
    expect(updated?.values).toMatchObject([
      {
        fieldId: category.current.id,
        source: AssetCustomFieldValueSource.Asset,
        value: "service",
      },
      {
        fieldId: priority.current.id,
        source: AssetCustomFieldValueSource.Asset,
        value: 3,
      },
    ]);
    await expect(
      assets.customFields.listAvailableDefinitionsForAsset(created.asset.id),
    ).resolves.toEqual([]);
  });

  it("preserves custom-field definition options and inventory filters", async () => {
    const assets = createCapability();
    const created = await createAsset();
    await assets.inventory.create({
      asset: {
        displayName: "worker.exposurenexus.local",
        type: AssetType.Software,
        environment: AssetEnvironment.Staging,
      },
      performedBy: auditUserId,
    });

    const definition = await assets.customFields.createDefinition({
      definition: {
        key: "deployment_tier",
        name: "Deployment tier",
        required: true,
        type: AssetCustomFieldType.Select,
        defaultValue: "prod",
        options: [
          { value: "prod", label: "Production" },
          { value: "stage", label: "Staging" },
        ],
      },
      performedBy: auditUserId,
    });
    expect(definition.current).toMatchObject({
      key: "deployment_tier",
      options: [
        expect.objectContaining({ value: "prod", label: "Production" }),
        expect.objectContaining({ value: "stage", label: "Staging" }),
      ],
    });
    await expect(assets.customFields.getDefinitionByID(definition.current.id)).resolves.toEqual(
      definition.current,
    );

    const updated = await assets.customFields.updateDefinitionByID({
      id: definition.current.id,
      definition: {
        key: "deployment_tier",
        name: "Deployment tier",
        required: true,
        type: AssetCustomFieldType.Select,
        defaultValue: "stage",
        options: [{ value: "stage", label: "Staging" }],
      },
      performedBy: auditUserId,
    });
    expect(updated?.current).toMatchObject({ defaultValue: "stage" });
    await expect(
      assets.inventory.listAll({
        types: [AssetType.Host],
        environments: [AssetEnvironment.Production],
      }),
    ).resolves.toHaveLength(1);
    await expect(assets.inventory.listAll({ search: "worker" })).resolves.toHaveLength(1);

    await expect(
      assets.customFields.deleteDefinitionByID({
        id: definition.current.id,
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ previous: { id: definition.current.id } });
    await expect(assets.customFields.getDefinitionByID(definition.current.id)).resolves.toBeNull();
    await expect(assets.inventory.getByID(created.asset.id)).resolves.toBeTruthy();
  });

  it("does not advance audit metadata for effective custom-field no-ops", async () => {
    const assets = createCapability();
    const created = await createAsset();
    const definition = await assets.customFields.createDefinition({
      definition: {
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
      performedBy: auditUserId,
    });

    const assignment = await assets.customFields.replaceAssignmentsForAsset({
      assetId: created.asset.id,
      fieldIds: [definition.current.id],
      performedBy: auditUserId,
    });
    const assignmentAudit = await testDb.db
      .selectFrom("asset")
      .select(["updatedAt", "updatedBy"])
      .where("id", "=", created.asset.id)
      .executeTakeFirstOrThrow();

    const noOpAssignment = await assets.customFields.replaceAssignmentsForAsset({
      assetId: created.asset.id,
      fieldIds: [definition.current.id],
      performedBy: auditUserId,
    });
    expect(noOpAssignment?.changed).toBe(false);
    expect(assignment?.changed).toBe(true);
    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", created.asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(assignmentAudit);
  });

  it("rolls back identifier and custom-field assignment writes when audit persistence fails", async () => {
    const assets = createCapability();
    const created = await createAsset();
    const definition = await assets.customFields.createDefinition({
      definition: {
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
      performedBy: auditUserId,
    });

    await expect(
      withFailingAssetAudit(() =>
        assets.inventory.addIdentifier({
          assetId: created.asset.id,
          identifier: {
            type: AssetIdentifierType.IpAddress,
            namespace: null,
            value: "192.0.2.10",
          },
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: "asset.identifier_add_failed", kind: "unexpected" });
    await expect(
      testDb.db
        .selectFrom("asset_identifier")
        .selectAll()
        .where("assetId", "=", created.asset.id)
        .execute(),
    ).resolves.toEqual([]);

    await expect(
      withFailingAssetAudit(() =>
        assets.customFields.replaceAssignmentsForAsset({
          assetId: created.asset.id,
          fieldIds: [definition.current.id],
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({
      code: "asset_custom_field.assignment.replace_failed",
      kind: "unexpected",
    });
    await expect(
      testDb.db
        .selectFrom("asset_custom_field_assignment")
        .selectAll()
        .where("assetId", "=", created.asset.id)
        .execute(),
    ).resolves.toEqual([]);

    await expect(
      assets.customFields.replaceAssignmentsForAsset({
        assetId: created.asset.id,
        fieldIds: [definition.current.id],
        performedBy: auditUserId,
      }),
    ).resolves.toMatchObject({ changed: true });
    await assets.customFields.replaceValuesForAsset({
      assetId: created.asset.id,
      values: [{ fieldId: definition.current.id, value: "before" }],
      performedBy: auditUserId,
    });

    await expect(
      withFailingAssetAudit(() =>
        assets.customFields.replaceValuesForAsset({
          assetId: created.asset.id,
          values: [{ fieldId: definition.current.id, value: "after" }],
          performedBy: auditUserId,
        }),
      ),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.replace_failed",
      kind: "unexpected",
    });
    await expect(
      assets.customFields.listEffectiveValuesForAsset(created.asset.id),
    ).resolves.toMatchObject([{ fieldId: definition.current.id, value: "before" }]);
  });
});
