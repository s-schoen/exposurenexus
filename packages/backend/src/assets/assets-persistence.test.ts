import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
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

  async function createAsset() {
    return await createCapability().inventory.create({
      asset: {
        displayName: "api.exposurenexus.local",
        type: AssetType.Host,
        environment: AssetEnvironment.Production,
        lifecycleState: AssetLifecycleState.Active,
        identifiers: [],
      },
      performedBy: auditUserId,
    });
  }

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
