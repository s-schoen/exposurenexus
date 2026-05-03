import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"
import {
  type AssetCustomFieldDefinition,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@openvlp/types/model/asset"
import { createAssetRepository } from "./asset.js"
import { createTestDatabase, resetTestDatabase } from "../test/db.js"

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {}
}))

function expectSelectDefinition(
  definition: AssetCustomFieldDefinition | null
): asserts definition is Extract<
  AssetCustomFieldDefinition,
  { type: AssetCustomFieldType.Select }
> {
  expect(definition).toBeTruthy()
  expect(definition?.type).toBe(AssetCustomFieldType.Select)
}

describe("asset repository", () => {
  const testDb = createTestDatabase()

  beforeAll(async () => {
    await testDb.start()
  })

  afterAll(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await resetTestDatabase(testDb.db)
  })

  it("persists and retrieves assets against a real database", async () => {
    const repository = createAssetRepository(testDb.db)
    const created = await repository.create({
      id: "",
      name: "api.openvlp.local",
      type: AssetType.Host
    })

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(created.name).toBe("api.openvlp.local")
    expect(created.type).toBe(AssetType.Host)
    expect(created.ownerId).toBeNull()

    await expect(repository.getByID(created.id)).resolves.toEqual(created)
    await expect(
      repository.getByName("api.openvlp.local", AssetType.Host)
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
      name: "owned.openvlp.local",
      type: AssetType.Host,
      ownerId
    })
    const ownerlessAsset = await repository.create({
      id: "",
      name: "ownerless.openvlp.local",
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

  it("persists and retrieves custom field definitions with options", async () => {
    const repository = createAssetRepository(testDb.db)

    const category = await repository.createCustomFieldDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    })
    const priority = await repository.createCustomFieldDefinition({
      key: "priority",
      name: "Priority",
      required: true,
      type: AssetCustomFieldType.Number,
      defaultValue: 3
    })
    const environment = await repository.createCustomFieldDefinition({
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" }
      ]
    })

    expect(category).toMatchObject({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    })
    expect(priority).toMatchObject({
      key: "priority",
      name: "Priority",
      required: true,
      type: AssetCustomFieldType.Number,
      defaultValue: 3
    })
    expect(environment).toMatchObject({
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod"
    })
    expectSelectDefinition(environment)
    expect(environment.options).toEqual([
      expect.objectContaining({
        fieldId: environment.id,
        value: "prod",
        label: "Production"
      }),
      expect.objectContaining({
        fieldId: environment.id,
        value: "stage",
        label: "Staging"
      })
    ])

    await expect(
      repository.getCustomFieldDefinitionByID(environment.id)
    ).resolves.toEqual(environment)
    await expect(repository.listCustomFieldDefinitions()).resolves.toEqual([
      category,
      environment,
      priority
    ])
  })

  it("updates custom field definitions and replaces select options", async () => {
    const repository = createAssetRepository(testDb.db)
    const environment = await repository.createCustomFieldDefinition({
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "dev", label: "Development" }
      ]
    })

    const updated = await repository.updateCustomFieldDefinitionByID(
      environment.id,
      {
        key: "environment_tier",
        name: "Environment tier",
        required: true,
        type: AssetCustomFieldType.Select,
        defaultValue: "stage",
        options: [
          { value: "prod", label: "Production" },
          { value: "stage", label: "Staging" }
        ]
      }
    )

    expect(updated).toMatchObject({
      id: environment.id,
      key: "environment_tier",
      name: "Environment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "stage"
    })
    expectSelectDefinition(updated)
    expect(updated.options).toEqual([
      expect.objectContaining({
        fieldId: environment.id,
        value: "prod",
        label: "Production"
      }),
      expect.objectContaining({
        fieldId: environment.id,
        value: "stage",
        label: "Staging"
      })
    ])

    const optionRows = await testDb.db
      .selectFrom("asset_custom_field_option")
      .selectAll()
      .where("fieldId", "=", environment.id)
      .execute()

    expect(optionRows.map((option) => option.value).sort()).toEqual([
      "prod",
      "stage"
    ])
  })

  it("deletes custom field definitions and cascades options and values", async () => {
    const repository = createAssetRepository(testDb.db)
    const asset = await repository.create({
      id: "",
      name: "api.openvlp.local",
      type: AssetType.Host
    })
    const environment = await repository.createCustomFieldDefinition({
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: null,
      options: [{ value: "prod", label: "Production" }]
    })

    await repository.upsertCustomFieldValues(asset.id, [
      { fieldId: environment.id, value: "prod" }
    ])
    await repository.assignCustomFields(asset.id, [environment.id])

    await expect(
      repository.deleteCustomFieldDefinitionByID(environment.id)
    ).resolves.toEqual(environment)
    await expect(repository.listCustomFieldDefinitions()).resolves.toEqual([])

    const optionRows = await testDb.db
      .selectFrom("asset_custom_field_option")
      .selectAll()
      .execute()
    const valueRows = await testDb.db
      .selectFrom("asset_custom_field_value")
      .selectAll()
      .execute()
    const assignmentRows = await testDb.db
      .selectFrom("asset_custom_field_assignment")
      .selectAll()
      .execute()

    expect(optionRows).toEqual([])
    expect(valueRows).toEqual([])
    expect(assignmentRows).toEqual([])
  })

  it("lists, upserts, and clears effective custom field values", async () => {
    const repository = createAssetRepository(testDb.db)
    const asset = await repository.create({
      id: "",
      name: "api.openvlp.local",
      type: AssetType.Host
    })
    const environment = await repository.createCustomFieldDefinition({
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "prod"
    })
    const priority = await repository.createCustomFieldDefinition({
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null
    })
    const exposure = await repository.createCustomFieldDefinition({
      key: "exposure",
      name: "Exposure",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: "internal",
      options: [
        { value: "external", label: "External" },
        { value: "internal", label: "Internal" }
      ]
    })
    expectSelectDefinition(exposure)

    await expect(
      repository.listAvailableCustomFieldDefinitions(asset.id)
    ).resolves.toEqual([environment, exposure, priority])

    await expect(
      repository.assignCustomFields(asset.id, [
        environment.id,
        priority.id,
        exposure.id
      ])
    ).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "prod"
      },
      {
        fieldId: exposure.id,
        key: "exposure",
        name: "Exposure",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Select,
        value: "internal",
        options: exposure.options
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])
    await expect(
      repository.listAvailableCustomFieldDefinitions(asset.id)
    ).resolves.toEqual([])

    await expect(repository.listCustomFieldValues(asset.id)).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "prod"
      },
      {
        fieldId: exposure.id,
        key: "exposure",
        name: "Exposure",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Select,
        value: "internal",
        options: exposure.options
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])

    await expect(
      repository.upsertCustomFieldValues(asset.id, [
        { fieldId: environment.id, value: "stage" },
        { fieldId: priority.id, value: 5 },
        { fieldId: exposure.id, value: "external" }
      ])
    ).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "stage"
      },
      {
        fieldId: exposure.id,
        key: "exposure",
        name: "Exposure",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "external",
        options: exposure.options
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 5
      }
    ])

    await expect(
      repository.upsertCustomFieldValues(asset.id, [
        { fieldId: environment.id, value: null }
      ])
    ).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "prod"
      },
      {
        fieldId: exposure.id,
        key: "exposure",
        name: "Exposure",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "external",
        options: exposure.options
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 5
      }
    ])

    await repository.clearCustomFieldValue(asset.id, priority.id)

    await expect(repository.listCustomFieldValues(asset.id)).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "prod"
      },
      {
        fieldId: exposure.id,
        key: "exposure",
        name: "Exposure",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "external",
        options: exposure.options
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])

    await repository.detachCustomField(asset.id, exposure.id)

    await expect(repository.listCustomFieldValues(asset.id)).resolves.toEqual([
      {
        fieldId: environment.id,
        key: "environment",
        name: "Environment",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "prod"
      },
      {
        fieldId: priority.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])

    const detachedValueRows = await testDb.db
      .selectFrom("asset_custom_field_value")
      .selectAll()
      .where("assetId", "=", asset.id)
      .where("fieldId", "=", exposure.id)
      .execute()

    expect(detachedValueRows).toEqual([])
  })

  it("lists assets with assigned effective custom field values", async () => {
    const repository = createAssetRepository(testDb.db)
    const apiAsset = await repository.create({
      id: "",
      name: "api.openvlp.local",
      type: AssetType.Host
    })
    const workerAsset = await repository.create({
      id: "",
      name: "worker.openvlp.local",
      type: AssetType.Host
    })
    const category = await repository.createCustomFieldDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    })
    const priority = await repository.createCustomFieldDefinition({
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null
    })

    await repository.assignCustomFields(apiAsset.id, [category.id, priority.id])
    await repository.assignCustomFields(workerAsset.id, [category.id])
    await repository.upsertCustomFieldValues(apiAsset.id, [
      { fieldId: priority.id, value: 4 }
    ])

    await expect(repository.listWithCustomFields()).resolves.toEqual([
      {
        ...apiAsset,
        customFields: [
          {
            fieldId: category.id,
            key: "category",
            name: "Category",
            source: AssetCustomFieldValueSource.Default,
            type: AssetCustomFieldType.Text,
            value: "platform"
          },
          {
            fieldId: priority.id,
            key: "priority",
            name: "Priority",
            source: AssetCustomFieldValueSource.Asset,
            type: AssetCustomFieldType.Number,
            value: 4
          }
        ]
      },
      {
        ...workerAsset,
        customFields: [
          {
            fieldId: category.id,
            key: "category",
            name: "Category",
            source: AssetCustomFieldValueSource.Default,
            type: AssetCustomFieldType.Text,
            value: "platform"
          }
        ]
      }
    ])
  })
})
