import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  type AssetCustomFieldDefinition,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createAssetCustomFieldRepository } from "./asset-custom-field.js";
import { createAssetRepository } from "./asset.js";

function expectSelectDefinition(
  definition: AssetCustomFieldDefinition | null,
): asserts definition is Extract<
  AssetCustomFieldDefinition,
  { type: AssetCustomFieldType.Select }
> {
  expect(definition).toBeTruthy();
  expect(definition?.type).toBe(AssetCustomFieldType.Select);
}

describe("asset custom field repository", () => {
  const testDb = createTestDatabase();
  const auditUserId = "85196743-cfba-4afb-b286-d36be32a64a4";
  const audit = {
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedBy: auditUserId,
  };

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
        username: "asset-custom-field-tester",
        displayName: "Asset Custom Field Tester",
        email: "asset-custom-field-tester@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  it("persists and retrieves custom field definitions with options", async () => {
    const repository = createAssetCustomFieldRepository(testDb.db);

    const category = await repository.createDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    });
    const priority = await repository.createDefinition({
      key: "priority",
      name: "Priority",
      required: true,
      type: AssetCustomFieldType.Number,
      defaultValue: 3,
    });
    const environment = await repository.createDefinition({
      key: "deployment_tier",
      name: "Deployment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" },
      ],
    });

    expect(category).toMatchObject({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    });
    expect(priority).toMatchObject({
      key: "priority",
      name: "Priority",
      required: true,
      type: AssetCustomFieldType.Number,
      defaultValue: 3,
    });
    expect(environment).toMatchObject({
      key: "deployment_tier",
      name: "Deployment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
    });
    expectSelectDefinition(environment);
    expect(environment.options).toEqual([
      expect.objectContaining({
        fieldId: environment.id,
        value: "prod",
        label: "Production",
      }),
      expect.objectContaining({
        fieldId: environment.id,
        value: "stage",
        label: "Staging",
      }),
    ]);

    await expect(repository.getDefinitionByID(environment.id)).resolves.toEqual(environment);
    await expect(repository.listDefinitions()).resolves.toEqual([category, environment, priority]);
  });

  it("updates custom field definitions and replaces select options", async () => {
    const repository = createAssetCustomFieldRepository(testDb.db);
    const environment = await repository.createDefinition({
      key: "deployment_tier",
      name: "Deployment tier",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "dev", label: "Development" },
      ],
    });

    const updated = await repository.updateDefinitionByID(environment.id, {
      key: "environment_tier",
      name: "Environment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "stage",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" },
      ],
    });

    expect(updated).toMatchObject({
      id: environment.id,
      key: "environment_tier",
      name: "Environment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "stage",
    });
    expectSelectDefinition(updated);
    expect(updated.options).toEqual([
      expect.objectContaining({
        fieldId: environment.id,
        value: "prod",
        label: "Production",
      }),
      expect.objectContaining({
        fieldId: environment.id,
        value: "stage",
        label: "Staging",
      }),
    ]);

    const optionRows = await testDb.db
      .selectFrom("asset_custom_field_option")
      .selectAll()
      .where("fieldId", "=", environment.id)
      .execute();

    expect(optionRows.map((option) => option.value).sort()).toEqual(["prod", "stage"]);
  });

  it("composes effective values and available definitions for assets", async () => {
    const assetRepository = createAssetRepository(testDb.db);
    const repository = createAssetCustomFieldRepository(testDb.db);
    const apiAsset = await assetRepository.create({
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: auditUserId,
      updatedBy: auditUserId,
    });
    const workerAsset = await assetRepository.create({
      displayName: "worker.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: auditUserId,
      updatedBy: auditUserId,
    });
    const category = await repository.createDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    });
    const environment = await repository.createDefinition({
      key: "deployment_tier",
      name: "Deployment tier",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: "stage",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" },
      ],
    });
    const priority = await repository.createDefinition({
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    });
    const team = await repository.createDefinition({
      key: "team",
      name: "Team",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    });

    await repository.replaceAssignmentsForAsset(
      apiAsset.id,
      [category.id, environment.id, priority.id],
      audit,
    );
    await repository.replaceValuesForAsset(
      apiAsset.id,
      [{ fieldId: environment.id, value: "prod" }],
      audit,
    );
    await repository.replaceAssignmentsForAsset(workerAsset.id, [category.id], audit);

    await expect(repository.listEffectiveValuesForAsset(apiAsset.id)).resolves.toMatchObject([
      {
        fieldId: category.id,
        source: AssetCustomFieldValueSource.Default,
        value: "platform",
      },
      {
        fieldId: environment.id,
        source: AssetCustomFieldValueSource.Asset,
        value: "prod",
        options: [
          expect.objectContaining({ value: "prod", label: "Production" }),
          expect.objectContaining({ value: "stage", label: "Staging" }),
        ],
      },
      {
        fieldId: priority.id,
        source: AssetCustomFieldValueSource.Empty,
        value: null,
      },
    ]);

    await expect(
      repository.replaceValuesForAsset(
        apiAsset.id,
        [{ fieldId: environment.id, value: null }],
        audit,
      ),
    ).resolves.toMatchObject([
      {
        fieldId: category.id,
        source: AssetCustomFieldValueSource.Default,
        value: "platform",
      },
      {
        fieldId: environment.id,
        source: AssetCustomFieldValueSource.Default,
        value: "stage",
      },
      {
        fieldId: priority.id,
        source: AssetCustomFieldValueSource.Empty,
        value: null,
      },
    ]);

    const valuesByAssetId = await repository.listEffectiveValuesForAssets([
      apiAsset.id,
      workerAsset.id,
    ]);
    expect(valuesByAssetId.get(workerAsset.id)).toMatchObject([
      {
        fieldId: category.id,
        source: AssetCustomFieldValueSource.Default,
        value: "platform",
      },
    ]);
    await expect(repository.listAvailableDefinitionsForAsset(apiAsset.id)).resolves.toEqual([team]);

    await repository.replaceValuesForAsset(
      apiAsset.id,
      [{ fieldId: environment.id, value: "prod" }],
      audit,
    );
    await repository.replaceAssignmentsForAsset(apiAsset.id, [category.id, priority.id], audit);

    await expect(repository.listEffectiveValuesForAsset(apiAsset.id)).resolves.toMatchObject([
      {
        fieldId: category.id,
        source: AssetCustomFieldValueSource.Default,
        value: "platform",
      },
      {
        fieldId: priority.id,
        source: AssetCustomFieldValueSource.Empty,
        value: null,
      },
    ]);

    const detachedValueRows = await testDb.db
      .selectFrom("asset_custom_field_value")
      .selectAll()
      .where("assetId", "=", apiAsset.id)
      .where("fieldId", "=", environment.id)
      .execute();
    expect(detachedValueRows).toEqual([]);
  });

  it("deletes custom field definitions and cascades options and values", async () => {
    const assetRepository = createAssetRepository(testDb.db);
    const repository = createAssetCustomFieldRepository(testDb.db);
    const asset = await assetRepository.create({
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: auditUserId,
      updatedBy: auditUserId,
    });
    const environment = await repository.createDefinition({
      key: "deployment_tier",
      name: "Deployment tier",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: null,
      options: [{ value: "prod", label: "Production" }],
    });

    await repository.replaceAssignmentsForAsset(asset.id, [environment.id], audit);
    await repository.replaceValuesForAsset(
      asset.id,
      [{ fieldId: environment.id, value: "prod" }],
      audit,
    );

    await expect(repository.deleteDefinitionByID(environment.id)).resolves.toEqual(environment);
    await expect(repository.listDefinitions()).resolves.toEqual([]);

    const optionRows = await testDb.db
      .selectFrom("asset_custom_field_option")
      .selectAll()
      .execute();
    const valueRows = await testDb.db.selectFrom("asset_custom_field_value").selectAll().execute();
    const assignmentRows = await testDb.db
      .selectFrom("asset_custom_field_assignment")
      .selectAll()
      .execute();

    expect(optionRows).toEqual([]);
    expect(valueRows).toEqual([]);
    expect(assignmentRows).toEqual([]);
  });

  it("updates parent audit metadata atomically for effective custom field changes", async () => {
    const assetRepository = createAssetRepository(testDb.db);
    const repository = createAssetCustomFieldRepository(testDb.db);
    const asset = await assetRepository.create({
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: auditUserId,
      updatedBy: auditUserId,
    });
    const category = await repository.createDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    });
    const assignmentAudit = {
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedBy: auditUserId,
    };

    await repository.replaceAssignmentsForAsset(asset.id, [category.id], assignmentAudit);

    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(assignmentAudit);

    const noOpAssignmentAudit = {
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      updatedBy: auditUserId,
    };
    await repository.replaceAssignmentsForAsset(asset.id, [category.id], noOpAssignmentAudit);

    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(assignmentAudit);

    const valueAudit = {
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      updatedBy: auditUserId,
    };
    await repository.replaceValuesForAsset(
      asset.id,
      [{ fieldId: category.id, value: "platform" }],
      valueAudit,
    );
    await repository.replaceValuesForAsset(
      asset.id,
      [{ fieldId: category.id, value: "platform" }],
      noOpAssignmentAudit,
    );

    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(valueAudit);

    await expect(
      repository.replaceAssignmentsForAsset(asset.id, [category.id], noOpAssignmentAudit),
    ).resolves.toMatchObject([
      {
        fieldId: category.id,
        source: AssetCustomFieldValueSource.Asset,
        value: "platform",
      },
    ]);
    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(valueAudit);

    await expect(
      repository.replaceAssignmentsForAsset(asset.id, [], {
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
        updatedBy: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow();

    await expect(
      testDb.db
        .selectFrom("asset_custom_field_assignment")
        .selectAll()
        .where("assetId", "=", asset.id)
        .execute(),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db
        .selectFrom("asset_custom_field_value")
        .selectAll()
        .where("assetId", "=", asset.id)
        .execute(),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db
        .selectFrom("asset")
        .select(["updatedAt", "updatedBy"])
        .where("id", "=", asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(valueAudit);
  });
});
