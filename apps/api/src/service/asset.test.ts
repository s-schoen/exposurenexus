import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@exposurenexus/types/model/asset"
import type { CreateAssetCustomFieldDefinition } from "@exposurenexus/types/model/asset"
import { pino } from "pino"
import { createAssetService } from "./asset.js"
import { createDomainEventCollector } from "../test/eventbus.js"

describe("asset service", () => {
  const domainEvents = createDomainEventCollector()
  const assetRepository = {
    list: vi.fn(),
    listWithCustomFields: vi.fn(),
    getByID: vi.fn(),
    getByIDWithCustomFields: vi.fn(),
    getByName: vi.fn(),
    create: vi.fn(),
    updateOwnerByID: vi.fn(),
    deleteByID: vi.fn(),
    countFindingsByAssetID: vi.fn(),
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
  const userProfileService = {
    getByID: vi.fn()
  }
  const logger = pino({ enabled: false })
  const eventContext = {
    actor: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    correlationId: "asset-service-request"
  }

  function createTestAssetService() {
    return createAssetService({
      assetRepository,
      userProfileService,
      domainEventEmitter: domainEvents.emitter,
      logger
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    domainEvents.clear()
    assetRepository.countFindingsByAssetID.mockResolvedValue(0)
    assetRepository.getByIDWithCustomFields.mockImplementation(async (id) => {
      const asset = await assetRepository.getByID(id)
      if (!asset) {
        return null
      }

      const customFields =
        (await assetRepository.listCustomFieldValues(id)) ?? []
      return {
        ...asset,
        ownerId: asset.ownerId ?? null,
        customFields
      }
    })
  })

  it("lists all assets from the repository", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host
      }
    ]
    const assetService = createTestAssetService()

    assetRepository.list.mockResolvedValue(assets)

    await expect(assetService.listAll()).resolves.toEqual(assets)
    expect(assetRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(assetService.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list assets"
    } satisfies Partial<HTTPException>)
  })

  it("lists all assets with custom fields from the repository", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        customFields: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            key: "category",
            name: "Category",
            source: AssetCustomFieldValueSource.Default,
            type: AssetCustomFieldType.Text,
            value: "platform"
          }
        ]
      }
    ]
    const assetService = createTestAssetService()

    assetRepository.listWithCustomFields.mockResolvedValue(assets)

    await expect(assetService.listAllWithCustomFields()).resolves.toEqual(
      assets
    )
    expect(assetRepository.listWithCustomFields).toHaveBeenCalledOnce()
  })

  it("maps repository list with custom fields failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.listWithCustomFields.mockRejectedValue(
      new Error("db offline")
    )

    await expect(assetService.listAllWithCustomFields()).rejects.toMatchObject({
      status: 500,
      message: "failed to list assets"
    } satisfies Partial<HTTPException>)
  })

  it("returns an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)

    await expect(assetService.getByID(asset.id)).resolves.toEqual(asset)
    expect(assetRepository.getByID).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when an asset does not exist", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(assetService.getByID(assetId)).resolves.toBeNull()
  })

  it("maps repository get by id failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

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
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

    assetRepository.getByName.mockResolvedValue(null)

    await expect(
      assetService.getByName("missing.exposurenexus.local", AssetType.Host)
    ).resolves.toBeNull()
  })

  it("maps repository get by name failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByName.mockRejectedValue(new Error("select failed"))

    await expect(
      assetService.getByName("api.exposurenexus.local", AssetType.Host)
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to get asset"
    } satisfies Partial<HTTPException>)
  })

  it("creates assets with a generated repository id", async () => {
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ownerId: null,
      ...payload
    }
    const assetService = createTestAssetService()

    assetRepository.create.mockResolvedValue(createdAsset)
    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      ...createdAsset,
      customFields: []
    })

    await expect(assetService.create(payload, eventContext)).resolves.toEqual(
      createdAsset
    )
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ownerId: null,
      ...payload
    })
    expect(domainEvents.subjects()).toEqual(["asset.created"])
    expect(domainEvents.eventsFor("asset.created")[0]).toMatchObject({
      subject: "asset.created",
      source: "asset",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        asset: {
          ...createdAsset,
          customFields: []
        }
      }
    })
  })

  it("creates assets with an existing enabled owner", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: true,
      roleIds: []
    })
    assetRepository.create.mockResolvedValue(createdAsset)
    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      ...createdAsset,
      customFields: []
    })

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset)
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId)
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload
    })
  })

  it("creates assets with an existing disabled owner", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: []
    })
    assetRepository.create.mockResolvedValue(createdAsset)
    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      ...createdAsset,
      customFields: []
    })

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset)
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId)
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload
    })
  })

  it("rejects unknown asset owners before creating assets", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue(null)

    await expect(
      assetService.create({
        name: "worker.exposurenexus.local",
        type: AssetType.Host,
        ownerId
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "asset owner does not exist"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.create).not.toHaveBeenCalled()
  })

  it("maps repository create failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.create.mockRejectedValue(new Error("insert failed"))

    await expect(
      assetService.create({
        name: "worker.exposurenexus.local",
        type: AssetType.Host
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create asset"
    } satisfies Partial<HTTPException>)
  })

  it("clears asset owners", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    }
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        customFields: []
      })
      .mockResolvedValueOnce({
        ...updatedAsset,
        customFields: []
      })
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset)

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId: null, eventContext })
    ).resolves.toEqual(updatedAsset)
    expect(userProfileService.getByID).not.toHaveBeenCalled()
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(assetId, null)
    expect(domainEvents.subjects()).toEqual(["asset.updated"])
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        previous: {
          ...updatedAsset,
          ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
          customFields: []
        },
        current: {
          ...updatedAsset,
          customFields: []
        }
      }
    })
  })

  it("updates asset owners to existing enabled users", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    }
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: true,
      roleIds: []
    })
    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: null,
        customFields: []
      })
      .mockResolvedValueOnce({
        ...updatedAsset,
        customFields: []
      })
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset)

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId })
    ).resolves.toEqual(updatedAsset)
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId)
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(
      assetId,
      ownerId
    )
  })

  it("updates asset owners to existing disabled users", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId
    }
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: []
    })
    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: null,
        customFields: []
      })
      .mockResolvedValueOnce({
        ...updatedAsset,
        customFields: []
      })
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset)

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId })
    ).resolves.toEqual(updatedAsset)
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId)
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(
      assetId,
      ownerId
    )
  })

  it("rejects unknown asset owner updates before changing assets", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
    const assetService = createTestAssetService()

    userProfileService.getByID.mockResolvedValue(null)

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId })
    ).rejects.toMatchObject({
      status: 400,
      message: "asset owner does not exist"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.updateOwnerByID).not.toHaveBeenCalled()
  })

  it("returns null when updating the owner of a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue(null)

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId: null })
    ).resolves.toBeNull()
    expect(assetRepository.updateOwnerByID).not.toHaveBeenCalled()
  })

  it("maps repository owner update failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: []
    })
    assetRepository.updateOwnerByID.mockRejectedValue(
      new Error("update failed")
    )

    await expect(
      assetService.updateOwnerByID({
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        ownerId: null
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update asset owner"
    } satisfies Partial<HTTPException>)
  })

  it("deletes an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      ...asset,
      ownerId: null,
      customFields: []
    })
    assetRepository.deleteByID.mockResolvedValue(asset)

    await expect(
      assetService.deleteByID(asset.id, eventContext)
    ).resolves.toEqual(asset)
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(
      asset.id
    )
    expect(
      assetRepository.countFindingsByAssetID.mock.invocationCallOrder[0]
    ).toBeLessThan(assetRepository.deleteByID.mock.invocationCallOrder[0])
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id)
    expect(domainEvents.subjects()).toEqual(["asset.deleted"])
    expect(domainEvents.eventsFor("asset.deleted")[0]).toMatchObject({
      subject: "asset.deleted",
      source: "asset",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        asset: {
          ...asset,
          ownerId: null,
          customFields: []
        }
      }
    })
  })

  it("returns null when deleting a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue(null)

    await expect(assetService.deleteByID(assetId)).resolves.toBeNull()
    expect(assetRepository.countFindingsByAssetID).not.toHaveBeenCalled()
    expect(assetRepository.deleteByID).not.toHaveBeenCalled()
  })

  it("rejects deleting an asset linked to findings", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: []
    }
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue(asset)
    assetRepository.countFindingsByAssetID.mockResolvedValue(2)

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      status: 409,
      message: `asset ${asset.id} is still referenced by findings`
    } satisfies Partial<HTTPException>)
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(
      asset.id
    )
    expect(assetRepository.deleteByID).not.toHaveBeenCalled()
    expect(domainEvents.subjects()).toEqual([])
  })

  it("maps database reference conflicts during asset deletion to 409", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: []
    }
    const assetService = createTestAssetService()
    const foreignKeyError = Object.assign(
      new Error("violates foreign key constraint"),
      { code: "23503" }
    )

    assetRepository.getByIDWithCustomFields.mockResolvedValue(asset)
    assetRepository.deleteByID.mockRejectedValue(foreignKeyError)

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      status: 409,
      message: `asset ${asset.id} is still referenced by findings`
    } satisfies Partial<HTTPException>)
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(
      asset.id
    )
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id)
    expect(domainEvents.subjects()).toEqual([])
  })

  it("maps repository delete failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields.mockResolvedValue({
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: []
    })
    assetRepository.deleteByID.mockRejectedValue(new Error("delete failed"))

    await expect(
      assetService.deleteByID("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to delete asset"
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
    const assetService = createTestAssetService()

    assetRepository.listCustomFieldDefinitions.mockResolvedValue(definitions)

    await expect(assetService.listCustomFieldDefinitions()).resolves.toEqual(
      definitions
    )
    expect(assetRepository.listCustomFieldDefinitions).toHaveBeenCalledOnce()
  })

  it("maps custom field definition list failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)

    await expect(
      assetService.getCustomFieldDefinitionByID(definition.id)
    ).resolves.toEqual(definition)
    expect(assetRepository.getCustomFieldDefinitionByID).toHaveBeenCalledWith(
      definition.id
    )
  })

  it("returns null when a custom field definition does not exist", async () => {
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.getCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
  })

  it("maps custom field definition get failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

    assetRepository.createCustomFieldDefinition.mockResolvedValue(created)

    await expect(
      assetService.createCustomFieldDefinition(payload, eventContext)
    ).resolves.toEqual(created)
    expect(assetRepository.createCustomFieldDefinition).toHaveBeenCalledWith(
      payload
    )
    expect(domainEvents.eventsFor("custom-field.created")).toMatchObject([
      {
        source: "asset",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { customFieldDefinition: created }
      }
    ])
  })

  it("rejects required custom fields without defaults", async () => {
    const assetService = createTestAssetService()

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
      message: "required custom fields must define a default value",
      cause: {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"]
      }
    } satisfies Partial<HTTPException>)
    expect(assetRepository.createCustomFieldDefinition).not.toHaveBeenCalled()
  })

  it("rejects invalid custom field default types", async () => {
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const updated = {
      id: previous.id,
      ...payload
    }
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(previous)
    assetRepository.updateCustomFieldDefinitionByID.mockResolvedValue(updated)

    await expect(
      assetService.updateCustomFieldDefinitionByID({
        id: updated.id,
        definition: payload,
        eventContext
      })
    ).resolves.toEqual(updated)
    expect(
      assetRepository.updateCustomFieldDefinitionByID
    ).toHaveBeenCalledWith(updated.id, payload)
    expect(domainEvents.eventsFor("custom-field.updated")).toMatchObject([
      {
        source: "asset",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { previous, current: updated }
      }
    ])
  })

  it("does not emit an event for no-op custom field definition updates", async () => {
    const payload: CreateAssetCustomFieldDefinition = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform"
    }
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload
    }
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.updateCustomFieldDefinitionByID.mockResolvedValue(
      definition
    )

    await expect(
      assetService.updateCustomFieldDefinitionByID({
        id: definition.id,
        definition: payload,
        eventContext
      })
    ).resolves.toEqual(definition)
    expect(domainEvents.eventsFor("custom-field.updated")).toEqual([])
  })

  it("returns null when updating a missing custom field definition", async () => {
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.updateCustomFieldDefinitionByID({
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      })
    ).resolves.toBeNull()
    expect(
      assetRepository.updateCustomFieldDefinitionByID
    ).not.toHaveBeenCalled()
  })

  it("maps custom field definition update conflicts to an HTTP 409", async () => {
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(previous)
    assetRepository.updateCustomFieldDefinitionByID.mockRejectedValue(
      Object.assign(
        new Error("duplicate key value violates unique constraint"),
        {
          code: "23505"
        }
      )
    )

    await expect(
      assetService.updateCustomFieldDefinitionByID({
        id: previous.id,
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "asset custom field definition already exists"
    } satisfies Partial<HTTPException>)
  })

  it("maps custom field definition update failures to an HTTP 500", async () => {
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const assetService = createTestAssetService()

    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(previous)
    assetRepository.updateCustomFieldDefinitionByID.mockRejectedValue(
      new Error("update failed")
    )

    await expect(
      assetService.updateCustomFieldDefinitionByID({
        id: previous.id,
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null
        }
      })
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
    const assetService = createTestAssetService()

    assetRepository.deleteCustomFieldDefinitionByID.mockResolvedValue(
      definition
    )

    await expect(
      assetService.deleteCustomFieldDefinitionByID(definition.id, eventContext)
    ).resolves.toEqual(definition)
    expect(domainEvents.eventsFor("custom-field.deleted")).toMatchObject([
      {
        source: "asset",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { customFieldDefinition: definition }
      }
    ])
  })

  it("returns null when deleting a missing custom field definition", async () => {
    const assetService = createTestAssetService()

    assetRepository.deleteCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.deleteCustomFieldDefinitionByID(
        "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      )
    ).resolves.toBeNull()
  })

  it("maps custom field definition delete failures to an HTTP 500", async () => {
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.listCustomFieldValues("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).resolves.toBeNull()
    expect(assetRepository.listCustomFieldValues).not.toHaveBeenCalled()
  })

  it("lists custom field values for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

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
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

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
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.upsertCustomFieldValues({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      })
    ).resolves.toBeNull()
    expect(assetRepository.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects upserts for unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([])
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      })
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
  })

  it("rejects invalid custom field value types", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "high"
          }
        ]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "invalid value for asset custom field priority"
    } satisfies Partial<HTTPException>)
  })

  it("rejects upserts for unassigned custom fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: 5
          }
        ]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "asset custom field is not assigned to asset"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.upsertCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects select custom field values outside the option set", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "stage"
          }
        ]
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "invalid value for asset custom field environment"
    } satisfies Partial<HTTPException>)
  })

  it("forwards valid custom field value upserts", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const previousValues = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null
      }
    ]
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce({
        ...asset,
        ownerId: null,
        customFields: previousValues
      })
      .mockResolvedValueOnce({
        ...asset,
        ownerId: null,
        customFields: values
      })
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.upsertCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: 5
          }
        ],
        eventContext
      })
    ).resolves.toEqual(values)
    expect(assetRepository.upsertCustomFieldValues).toHaveBeenCalledWith(
      asset.id,
      [{ fieldId: definition.id, value: 5 }]
    )
    expect(domainEvents.subjects()).toEqual(["asset.updated"])
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      subject: "asset.updated",
      source: "asset",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        previous: {
          ...asset,
          ownerId: null,
          customFields: previousValues
        },
        current: {
          ...asset,
          ownerId: null,
          customFields: values
        }
      }
    })
  })

  it("does not emit asset update events for unchanged custom field values", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
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
    const snapshot = {
      ...asset,
      customFields: values
    }
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.upsertCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: 5
          }
        ],
        eventContext
      })
    ).resolves.toEqual(values)
    expect(domainEvents.subjects()).toEqual([])
  })

  it("forwards valid text custom field value upserts", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "platform"
          }
        ]
      })
    ).resolves.toEqual(values)
  })

  it("maps custom field value upsert failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.upsertCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "platform"
          }
        ]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to update asset custom field values"
    } satisfies Partial<HTTPException>)
  })

  it("returns null when clearing a custom field value for a missing asset", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.clearCustomFieldValue({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      })
    ).resolves.toBeNull()
    expect(assetRepository.clearCustomFieldValue).not.toHaveBeenCalled()
  })

  it("rejects clearing unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.clearCustomFieldValue({
        assetId: asset.id,
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      })
    ).rejects.toMatchObject({
      status: 400,
      message:
        "unknown asset custom field id 5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
    } satisfies Partial<HTTPException>)
  })

  it("rejects clearing unassigned custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.clearCustomFieldValue({
        assetId: asset.id,
        fieldId: definition.id
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "asset custom field is not assigned to asset"
    } satisfies Partial<HTTPException>)
    expect(assetRepository.clearCustomFieldValue).not.toHaveBeenCalled()
  })

  it("clears custom field values for existing assets and fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.clearCustomFieldValue({
        assetId: asset.id,
        fieldId: definition.id,
        eventContext
      })
    ).resolves.toBe(true)
    expect(assetRepository.clearCustomFieldValue).toHaveBeenCalledWith(
      asset.id,
      definition.id
    )
  })

  it("maps custom field value clear failures to an HTTP 500", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

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
      assetService.clearCustomFieldValue({
        assetId: asset.id,
        fieldId: definition.id
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to clear asset custom field value"
    } satisfies Partial<HTTPException>)
  })

  it("assigns custom fields to an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByIDWithCustomFields
      .mockResolvedValueOnce({
        ...asset,
        ownerId: null,
        customFields: []
      })
      .mockResolvedValueOnce({
        ...asset,
        ownerId: null,
        customFields: values
      })
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.assignCustomFields.mockResolvedValue(values)

    await expect(
      assetService.assignCustomFields({
        assetId: asset.id,
        fieldIds: [definition.id],
        eventContext
      })
    ).resolves.toEqual(values)
    expect(assetRepository.assignCustomFields).toHaveBeenCalledWith(asset.id, [
      definition.id
    ])
    expect(domainEvents.subjects()).toEqual(["asset.updated"])
  })

  it("returns null when assigning custom fields to a missing asset", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.assignCustomFields({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        fieldIds: ["5bde818a-bb4f-4a0f-a5eb-a190d5142a25"]
      })
    ).resolves.toBeNull()
    expect(assetRepository.listCustomFieldDefinitions).not.toHaveBeenCalled()
    expect(assetRepository.assignCustomFields).not.toHaveBeenCalled()
  })

  it("rejects assigning unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([])

    await expect(
      assetService.assignCustomFields({
        assetId: asset.id,
        fieldIds: ["5bde818a-bb4f-4a0f-a5eb-a190d5142a25"]
      })
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
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldDefinitions.mockResolvedValue([definition])
    assetRepository.assignCustomFields.mockRejectedValue(
      new Error("insert failed")
    )

    await expect(
      assetService.assignCustomFields({
        assetId: asset.id,
        fieldIds: [definition.id]
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to assign asset custom fields"
    } satisfies Partial<HTTPException>)
  })

  it("detaches custom fields from existing assets", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.detachCustomField.mockResolvedValue(undefined)

    await expect(
      assetService.detachCustomField({
        assetId: asset.id,
        fieldId: definition.id,
        eventContext
      })
    ).resolves.toBe(true)
    expect(assetRepository.detachCustomField).toHaveBeenCalledWith(
      asset.id,
      definition.id
    )
  })

  it("returns null when detaching custom fields from a missing asset", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.detachCustomField({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      })
    ).resolves.toBeNull()
    expect(assetRepository.getCustomFieldDefinitionByID).not.toHaveBeenCalled()
    expect(assetRepository.detachCustomField).not.toHaveBeenCalled()
  })

  it("rejects detaching unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(null)

    await expect(
      assetService.detachCustomField({
        assetId: asset.id,
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      })
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
      name: "api.exposurenexus.local",
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
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.getCustomFieldDefinitionByID.mockResolvedValue(definition)
    assetRepository.detachCustomField.mockRejectedValue(
      new Error("delete failed")
    )

    await expect(
      assetService.detachCustomField({
        assetId: asset.id,
        fieldId: definition.id
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to detach asset custom field"
    } satisfies Partial<HTTPException>)
  })
})
