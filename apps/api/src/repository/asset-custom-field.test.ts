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
  AssetCustomFieldType
} from "@exposurenexus/types/model/asset-custom-field"
import { AssetType } from "@exposurenexus/types/model/asset"
import { createAssetRepository } from "./asset.js"
import { createAssetCustomFieldRepository } from "./asset-custom-field.js"
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

describe("asset custom field repository", () => {
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

  it("persists and retrieves custom field definitions with options", async () => {
    const repository = createAssetCustomFieldRepository(testDb.db)

    const category = await repository.createDefinition({
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    })
    const priority = await repository.createDefinition({
      key: "priority",
      name: "Priority",
      required: true,
      type: AssetCustomFieldType.Number,
      defaultValue: 3
    })
    const environment = await repository.createDefinition({
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

    await expect(repository.getDefinitionByID(environment.id)).resolves.toEqual(
      environment
    )
    await expect(repository.listDefinitions()).resolves.toEqual([
      category,
      environment,
      priority
    ])
  })

  it("updates custom field definitions and replaces select options", async () => {
    const repository = createAssetCustomFieldRepository(testDb.db)
    const environment = await repository.createDefinition({
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

    const updated = await repository.updateDefinitionByID(environment.id, {
      key: "environment_tier",
      name: "Environment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "stage",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" }
      ]
    })

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
    const assetRepository = createAssetRepository(testDb.db)
    const repository = createAssetCustomFieldRepository(testDb.db)
    const asset = await assetRepository.create({
      id: "",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    })
    const environment = await repository.createDefinition({
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: null,
      options: [{ value: "prod", label: "Production" }]
    })

    await assetRepository.replaceCustomFieldValues(asset.id, [
      { fieldId: environment.id, value: "prod" }
    ])
    await assetRepository.replaceCustomFieldAssociations(asset.id, [
      environment.id
    ])

    await expect(
      repository.deleteDefinitionByID(environment.id)
    ).resolves.toEqual(environment)
    await expect(repository.listDefinitions()).resolves.toEqual([])

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
})
