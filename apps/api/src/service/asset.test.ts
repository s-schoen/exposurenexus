import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@openvlp/types/model/asset"
import type { CreateAssetCustomFieldDefinition } from "@openvlp/types/model/asset"
import { pino } from "pino"
import { createAssetService } from "./asset.js"

describe("asset service", () => {
  const assetRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByName: vi.fn(),
    create: vi.fn(),
    deleteByID: vi.fn(),
    listCustomFieldDefinitions: vi.fn(),
    getCustomFieldDefinitionByID: vi.fn(),
    createCustomFieldDefinition: vi.fn(),
    updateCustomFieldDefinitionByID: vi.fn(),
    deleteCustomFieldDefinitionByID: vi.fn(),
    listCustomFieldValues: vi.fn(),
    listAvailableCustomFieldDefinitions: vi.fn(),
    upsertCustomFieldValues: vi.fn(),
    clearCustomFieldValue: vi.fn(),
    assignCustomFields: vi.fn(),
    detachCustomField: vi.fn()
  }
  const logger = pino({ enabled: false })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists all assets from the repository", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.openvlp.local",
        type: AssetType.Host
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.list.mockResolvedValue(assets)

    await expect(assetService.listAll()).resolves.toEqual(assets)
    expect(assetRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(assetService.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list assets"
    } satisfies Partial<HTTPException>)
  })

  it("returns an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)

    await expect(assetService.getByID(asset.id)).resolves.toEqual(asset)
    expect(assetRepository.getByID).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when an asset does not exist", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(assetService.getByID(assetId)).resolves.toBeNull()
  })

  it("maps repository get by id failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockRejectedValue(new Error("select failed"))

    await expect(
      assetService.getByID("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get asset"
    } satisfies Partial<HTTPException>)
  })

  it("passes the lookup name and type to the repository", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByName.mockResolvedValue(asset)

    await expect(
      assetService.getByName(asset.name, asset.type)
    ).resolves.toEqual(asset)
    expect(assetRepository.getByName).toHaveBeenCalledWith(
      asset.name,
      asset.type
    )
  })

  it("returns null when an asset name lookup does not match", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByName.mockResolvedValue(null)

    await expect(
      assetService.getByName("missing.openvlp.local", AssetType.Host)
    ).resolves.toBeNull()
  })

  it("maps repository get by name failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByName.mockRejectedValue(new Error("select failed"))

    await expect(
      assetService.getByName("api.openvlp.local", AssetType.Host)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get asset"
    } satisfies Partial<HTTPException>)
  })

  it("creates assets with a generated repository id", async () => {
    const payload = {
      name: "worker.openvlp.local",
      type: AssetType.Host
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.create.mockResolvedValue(createdAsset)

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset)
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload
    })
  })

  it("maps repository create failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.create.mockRejectedValue(new Error("insert failed"))

    await expect(
      assetService.create({
        name: "worker.openvlp.local",
        type: AssetType.Host
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create asset"
    } satisfies Partial<HTTPException>)
  })

  it("deletes an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteByID.mockResolvedValue(asset)

    await expect(assetService.deleteByID(asset.id)).resolves.toEqual(asset)
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when deleting a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteByID.mockResolvedValue(null)

    await expect(assetService.deleteByID(assetId)).resolves.toBeNull()
  })

  it("maps repository delete failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteByID.mockRejectedValue(new Error("delete failed"))

    await expect(
      assetService.deleteByID("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get asset"
    } satisfies Partial<HTTPException>)
  })

  it("lists custom field definitions from the repository", async () => {
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.listCustomFieldDefinitions.mockResolvedValue(definitions)

    await expect(assetService.listCustomFieldDefinitions()).resolves.toEqual(
      definitions
    )
    expect(assetRepository.listCustomFieldDefinitions).toHaveBeenCalledOnce()
  })

  it("maps custom field definition list failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.listCustomFieldDefinitions.mockRejectedValue(
      new Error("select failed")
    )

    await expect(
      assetService.listCustomFieldDefinitions()
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to list asset custom field definitions"
    } satisfies Partial<HTTPException>)
  })

  it("returns a custom field definition by id", async () => {
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)

    await expect(
      assetService.getCustomFieldDefinitionByID(definition.id)
    ).resolves.toEqual(definition)
    expect(assetRepository.getCustomFieldDefinitionByID).toHaveBeenCalledWith(
      definition.id
    )
  })

  it("returns null when a custom field definition does not exist", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.getCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
  })

  it("maps custom field definition get failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getCustomFieldDefinitionByID.mockRejectedValue(
      new Error("select failed")
    )

    await expect(
      assetService.getCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get asset custom field definition"
    } satisfies Partial<HTTPException>)
  })

  it("creates a valid custom field definition", async () => {
    const payload: CreateAssetCustomFieldDefinition = {
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" }
      ]
    }
    const created = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload,
      options: payload.options.map((option) => ({
        id: crypto.randomUUID(),
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        ...option
      }))
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.createCustomFieldDefinition.mockResolvedValue(created)

    await expect(
      assetService.createCustomFieldDefinition(payload)
    ).resolves.toEqual(created)
    expect(assetRepository.createCustomFieldDefinition).toHaveBeenCalledWith(
      payload
    )
  })

  it("rejects required custom fields without defaults", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "required custom fields must define a default value"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.createCustomFieldDefinition).not.toHaveBeenCalled()
  })

  it("rejects invalid custom field default types", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high" as never
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "number custom field default must be a number"
    } satisfies Partial<HTTPException>)
  })

  it("rejects text custom field defaults that are not strings", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "text custom field default must be a string"
    } satisfies Partial<HTTPException>)
  })

  it("rejects select custom field defaults that are not strings", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [{ value: "prod", label: "Production" }]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "select custom field default must be a string"
    } satisfies Partial<HTTPException>)
  })

  it("rejects select defaults that do not match an option", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "dev",
        options: [{ value: "prod", label: "Production" }]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "select custom field default must match an option value"
    } satisfies Partial<HTTPException>)
  })

  it("rejects duplicate select option values", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    await expect(
      assetService.createCustomFieldDefinition({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: null,
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" }
        ]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "select custom field options must be unique"
    } satisfies Partial<HTTPException>)
  })

  it("maps custom field definition create conflicts to an HTTP 409", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.createCustomFieldDefinition.mockRejectedValue(
      Object.assign(
        new Error("duplicate key value violates unique constraint"),
        {
          code: "23505"
        }
      )
    )

    await expect(
      assetService.createCustomFieldDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "asset custom field definition already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps custom field definition create failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.createCustomFieldDefinition.mockRejectedValue(
      new Error("insert failed")
    )

    await expect(
      assetService.createCustomFieldDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create asset custom field definition"
    } satisfies Partial<HTTPException>)
  })

  it("updates valid custom field definitions", async () => {
    const payload: CreateAssetCustomFieldDefinition = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    }
    const updated = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.updateCustomFieldDefinitionByID.mockResolvedValue(updated)

    await expect(
      assetService.updateCustomFieldDefinitionByID(updated.id, payload)
    ).resolves.toEqual(updated)
    expect(
      assetRepository.updateCustomFieldDefinitionByID
    ).toHaveBeenCalledWith(updated.id, payload)
  })

  it("returns null when updating a missing custom field definition", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.updateCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.updateCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      )
    ).resolves.toBeNull()
  })

  it("maps custom field definition update conflicts to an HTTP 409", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.updateCustomFieldDefinitionByID.mockRejectedValue(
      Object.assign(
        new Error("duplicate key value violates unique constraint"),
        {
          code: "23505"
        }
      )
    )

    await expect(
      assetService.updateCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      )
    ).rejects.toMatchObject({
      status: 409,
      message: "asset custom field definition already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps custom field definition update failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.updateCustomFieldDefinitionByID.mockRejectedValue(
      new Error("update failed")
    )

    await expect(
      assetService.updateCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      )
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update asset custom field definition"
    } satisfies Partial<HTTPException>)
  })

  it("deletes custom field definitions", async () => {
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteCustomFieldDefinitionByID.mockResolvedValue(
      definition
    )

    await expect(
      assetService.deleteCustomFieldDefinitionByID(definition.id)
    ).resolves.toEqual(definition)
  })

  it("returns null when deleting a missing custom field definition", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.deleteCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
  })

  it("maps custom field definition delete failures to an HTTP 500", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.deleteCustomFieldDefinitionByID.mockRejectedValue(
      new Error("delete failed")
    )

    await expect(
      assetService.deleteCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to delete asset custom field definition"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when listing custom field values for a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.listCustomFieldValues("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).resolves.toBeNull()
    expect(assetRepository.listCustomFieldValues).not.toHaveBeenCalled()
  })

  it("lists custom field values for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const values = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "platform"
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldValues.mockResolvedValue(values)

    await expect(assetService.listCustomFieldValues(asset.id)).resolves.toEqual(
      values
    )
    expect(assetRepository.listCustomFieldValues).toHaveBeenCalledWith(asset.id)
  })

  it("maps custom field value list failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldValues.mockRejectedValue(
      new Error("select failed")
    )

    await expect(
      assetService.listCustomFieldValues(asset.id)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to list asset custom field values"
    } satisfies Partial<HTTPException>)
  })

  it("lists custom field definitions available for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listAvailableCustomFieldDefinitions.mockResolvedValue(
      definitions
    )

    await expect(
      assetService.listAvailableCustomFieldDefinitions(asset.id)
    ).resolves.toEqual(definitions)
    expect(
      assetRepository.listAvailableCustomFieldDefinitions
    ).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when listing available custom fields for a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.listAvailableCustomFieldDefinitions(
        "76b1885f-2d28-4b7d-93da-2751ff385aa3"
      )
    ).resolves.toBeNull()
    expect(
      assetRepository.listAvailableCustomFieldDefinitions
    ).not.toHaveBeenCalled()
  })

  it("maps available custom field list failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listAvailableCustomFieldDefinitions.mockRejectedValue(
      new Error("select failed")
    )

    await expect(
      assetService.listAvailableCustomFieldDefinitions(asset.id)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to list available asset custom fields"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when upserting custom field values for a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.upsertCustomFieldValues(
        "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      )
    ).resolves.toBeNull()
    expect(assetRepository.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects upserts for unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([])
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          value: "platform"
        }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
  })

  it("rejects invalid custom field value types", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: "high"
        }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: "invalid value for asset custom field priority"
    } satisfies Partial<HTTPException>)
  })

  it("rejects upserts for unassigned custom fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: 5
        }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: "asset custom field is not assigned to asset"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects select custom field values outside the option set", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "environment",
      name: "Environment",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: null,
      options: [
        {
          id: "2db67190-9d84-482f-9936-cfbf4244752b",
          fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          value: "prod",
          label: "Production"
        }
      ]
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Select,
        value: null,
        options: definition.options
      }
    ])

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: "stage"
        }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: "invalid value for asset custom field environment"
    } satisfies Partial<HTTPException>)
  })

  it("forwards valid custom field value upserts", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null
    }
    const values = [
      {
        fieldId: definition.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 5
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ])
    assetRepository.upsertCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: 5
        }
      ])
    ).resolves.toEqual(values)
    expect(assetRepository.upsertCustomFieldValues).toHaveBeenCalledWith(
      asset.id,
      [{ fieldId: definition.id, value: 5 }]
    )
  })

  it("forwards valid text custom field value upserts", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const values = [
      {
        fieldId: definition.id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "platform"
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null
      }
    ])
    assetRepository.upsertCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: "platform"
        }
      ])
    ).resolves.toEqual(values)
  })

  it("maps custom field value upsert failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null
      }
    ])
    assetRepository.upsertCustomFieldValues.mockRejectedValue(
      new Error("upsert failed")
    )

    await expect(
      assetService.upsertCustomFieldValues(asset.id, [
        {
          fieldId: definition.id,
          value: "platform"
        }
      ])
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update asset custom field values"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when clearing a custom field value for a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.clearCustomFieldValue(
        "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
    expect(assetRepository.clearCustomFieldValue).not.toHaveBeenCalled()
  })

  it("rejects clearing unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.clearCustomFieldValue(
        asset.id,
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
  })

  it("rejects clearing unassigned custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.clearCustomFieldValue(asset.id, definition.id)
    ).rejects.toMatchObject({
      status: 400,
      message: "asset custom field is not assigned to asset"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.clearCustomFieldValue).not.toHaveBeenCalled()
  })

  it("clears custom field values for existing assets and fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null
      }
    ])
    assetRepository.clearCustomFieldValue.mockResolvedValue(undefined)

    await expect(
      assetService.clearCustomFieldValue(asset.id, definition.id)
    ).resolves.toBe(true)
    expect(assetRepository.clearCustomFieldValue).toHaveBeenCalledWith(
      asset.id,
      definition.id
    )
  })

  it("maps custom field value clear failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.listCustomFieldValues.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "platform"
      }
    ])
    assetRepository.clearCustomFieldValue.mockRejectedValue(
      new Error("delete failed")
    )

    await expect(
      assetService.clearCustomFieldValue(asset.id, definition.id)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to clear asset custom field value"
    } satisfies Partial<HTTPException>)
  })

  it("assigns custom fields to an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const values = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null
      }
    ]
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.assignCustomFields.mockResolvedValue(values)

    await expect(
      assetService.assignCustomFields(asset.id, [definition.id])
    ).resolves.toEqual(values)
    expect(assetRepository.assignCustomFields).toHaveBeenCalledWith(asset.id, [
      definition.id
    ])
  })

  it("returns null when assigning custom fields to a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.assignCustomFields(
        "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        ["5bde818a-bb4f-4a0f-a5eb-a190d5142a25"]
      )
    ).resolves.toBeNull()
    expect(assetRepository.listCustomFieldDefinitions).not.toHaveBeenCalled()
    expect(assetRepository.assignCustomFields).not.toHaveBeenCalled()
  })

  it("rejects assigning unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([])

    await expect(
      assetService.assignCustomFields(asset.id, [
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      ])
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.assignCustomFields).not.toHaveBeenCalled()
  })

  it("maps custom field assignment failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.assignCustomFields.mockRejectedValue(
      new Error("insert failed")
    )

    await expect(
      assetService.assignCustomFields(asset.id, [definition.id])
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to assign asset custom fields"
    } satisfies Partial<HTTPException>)
  })

  it("detaches custom fields from existing assets", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.detachCustomField.mockResolvedValue(undefined)

    await expect(
      assetService.detachCustomField(asset.id, definition.id)
    ).resolves.toBe(true)
    expect(assetRepository.detachCustomField).toHaveBeenCalledWith(
      asset.id,
      definition.id
    )
  })

  it("returns null when detaching custom fields from a missing asset", async () => {
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.detachCustomField(
        "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
    expect(assetRepository.getCustomFieldDefinitionByID).not.toHaveBeenCalled()
    expect(assetRepository.detachCustomField).not.toHaveBeenCalled()
  })

  it("rejects detaching unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.detachCustomField(
        asset.id,
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.detachCustomField).not.toHaveBeenCalled()
  })

  it("maps custom field detach failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createAssetService({ assetRepository, logger })

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.detachCustomField.mockRejectedValue(
      new Error("delete failed")
    )

    await expect(
      assetService.detachCustomField(asset.id, definition.id)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to detach asset custom field"
    } satisfies Partial<HTTPException>)
  })
})
