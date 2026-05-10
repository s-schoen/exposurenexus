import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  type Asset,
  type AssetWithCustomFields,
  AssetType
} from "@exposurenexus/types/model/asset"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@exposurenexus/types/model/asset-custom-field"
import { pino } from "pino"
import { createAssetService } from "./asset.js"
import { ApplicationError } from "./application-error.js"
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
    listCustomFieldValues: vi.fn(),
    replaceCustomFieldValues: vi.fn()
  }
  const assetCustomFieldReader = {
    listEffectiveValuesForAssets: vi.fn()
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
      assetCustomFieldReader,
      userProfileService,
      domainEventEmitter: domainEvents.emitter,
      logger
    })
  }

  function assetFromSnapshot(snapshot: AssetWithCustomFields): Asset {
    return {
      id: snapshot.id,
      name: snapshot.name,
      type: snapshot.type,
      ownerId: snapshot.ownerId
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
    domainEvents.clear()
    assetRepository.countFindingsByAssetID.mockResolvedValue(0)
    const snapshotByAssetId = new Map<string, AssetWithCustomFields>()
    assetRepository.getByID.mockImplementation(async (id) => {
      const snapshot = await assetRepository.getByIDWithCustomFields(id)
      if (!snapshot) {
        return null
      }

      snapshotByAssetId.set(id, snapshot)
      return assetFromSnapshot(snapshot)
    })
    assetRepository.list.mockImplementation(async () => {
      const snapshots = ((await assetRepository.listWithCustomFields()) ??
        []) as AssetWithCustomFields[]
      return snapshots.map(assetFromSnapshot)
    })
    assetCustomFieldReader.listEffectiveValuesForAssets.mockImplementation(
      async (assetIds: readonly string[]) => {
        const valuesByAssetId = new Map<
          string,
          AssetWithCustomFields["customFields"]
        >()
        const listSnapshots = ((await assetRepository.listWithCustomFields()) ??
          []) as AssetWithCustomFields[]

        for (const assetId of assetIds) {
          const snapshotFromLookup = snapshotByAssetId.get(assetId)
          if (snapshotFromLookup) {
            snapshotByAssetId.delete(assetId)
            valuesByAssetId.set(assetId, snapshotFromLookup.customFields ?? [])
            continue
          }

          const values = await assetRepository.listCustomFieldValues(assetId)
          if (values) {
            valuesByAssetId.set(assetId, values)
            continue
          }

          const snapshot =
            (await assetRepository.getByIDWithCustomFields(assetId)) ??
            listSnapshots.find((asset) => asset.id === assetId)
          valuesByAssetId.set(assetId, snapshot?.customFields ?? [])
        }

        return valuesByAssetId
      }
    )
    assetRepository.getByIDWithCustomFields.mockImplementation(async (id) => {
      const snapshots = ((await assetRepository.listWithCustomFields()) ??
        []) as AssetWithCustomFields[]
      return snapshots.find((asset) => asset.id === id) ?? null
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

  it("maps repository list failures to an application error", async () => {
    const assetService = createTestAssetService()

    assetRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(assetService.listAll()).rejects.toMatchObject({
      code: "asset.list_failed",
      kind: "unexpected"
    } satisfies Partial<ApplicationError>)
  })

  it("lists all assets with custom fields through the custom field projection", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null
      }
    ]
    const customFields = [
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

    assetRepository.list.mockResolvedValue(assets)
    assetCustomFieldReader.listEffectiveValuesForAssets.mockResolvedValue(
      new Map([[assets[0].id, customFields]])
    )

    await expect(assetService.listAllWithCustomFields()).resolves.toEqual([
      {
        ...assets[0],
        customFields
      }
    ])
    expect(assetRepository.list).toHaveBeenCalledOnce()
    expect(
      assetCustomFieldReader.listEffectiveValuesForAssets
    ).toHaveBeenCalledWith([assets[0].id])
  })

  it("maps repository list failures for asset custom field projections to an application error", async () => {
    const assetService = createTestAssetService()

    assetRepository.list.mockRejectedValue(new Error("db offline"))

    await expect(assetService.listAllWithCustomFields()).rejects.toMatchObject({
      code: "asset.list_with_custom_fields_failed",
      kind: "unexpected"
    } satisfies Partial<ApplicationError>)
  })

  it("preserves custom field projection failures while listing assets with custom fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null
    }
    const error = new ApplicationError({
      code: "asset_custom_field.value.list_for_assets_failed",
      kind: "unexpected",
      message: "failed to hydrate asset custom field values",
      details: { assetIds: [asset.id] }
    })
    const assetService = createTestAssetService()

    assetRepository.list.mockResolvedValue([asset])
    assetCustomFieldReader.listEffectiveValuesForAssets.mockRejectedValue(error)

    await expect(assetService.listAllWithCustomFields()).rejects.toBe(error)
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

  it("maps repository get by id failures to an application error", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByID.mockRejectedValue(new Error("select failed"))

    await expect(
      assetService.getByID("76b1885f-2d28-4b7d-93da-2751ff385aa3")
    ).rejects.toMatchObject({
      code: "asset.get_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" }
    } satisfies Partial<ApplicationError>)
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

  it("maps repository get by name failures to an application error", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByName.mockRejectedValue(new Error("select failed"))

    await expect(
      assetService.getByName("api.exposurenexus.local", AssetType.Host)
    ).rejects.toMatchObject({
      code: "asset.get_by_name_failed",
      kind: "unexpected",
      details: {
        assetName: "api.exposurenexus.local",
        assetType: AssetType.Host
      }
    } satisfies Partial<ApplicationError>)
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
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId }
    } satisfies Partial<ApplicationError>)
    expect(assetRepository.create).not.toHaveBeenCalled()
  })

  it("maps repository create failures to an application error", async () => {
    const assetService = createTestAssetService()

    assetRepository.create.mockRejectedValue(new Error("insert failed"))

    await expect(
      assetService.create({
        name: "worker.exposurenexus.local",
        type: AssetType.Host
      })
    ).rejects.toMatchObject({
      code: "asset.create_failed",
      kind: "unexpected",
      details: {
        assetName: "worker.exposurenexus.local",
        assetType: AssetType.Host
      }
    } satisfies Partial<ApplicationError>)
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
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId }
    } satisfies Partial<ApplicationError>)
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

  it("maps repository owner update failures to an application error", async () => {
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
      code: "asset.owner_update_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" }
    } satisfies Partial<ApplicationError>)
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
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id }
    } satisfies Partial<ApplicationError>)
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
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id }
    } satisfies Partial<ApplicationError>)
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(
      asset.id
    )
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id)
    expect(domainEvents.subjects()).toEqual([])
  })

  it("maps repository delete failures to an application error", async () => {
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
      code: "asset.delete_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" }
    } satisfies Partial<ApplicationError>)
  })

  it("returns null when replacing custom field values for a missing asset", async () => {
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(null)

    await expect(
      assetService.replaceCustomFieldValues({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      })
    ).resolves.toBeNull()
    expect(assetRepository.replaceCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects value replacements for unassigned custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host
    }
    const assetService = createTestAssetService()

    assetRepository.getByID.mockResolvedValue(asset)
    assetRepository.listCustomFieldValues.mockResolvedValue([])

    await expect(
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform"
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field.not_assigned",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25"
      }
    } satisfies Partial<ApplicationError>)
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
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "high"
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field_value.invalid",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: definition.id,
        fieldKey: definition.key
      }
    } satisfies Partial<ApplicationError>)
  })

  it("rejects value replacements that omit assigned custom fields", async () => {
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
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: []
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field_value.missing",
      kind: "validation",
      details: { assetId: asset.id, fieldId: definition.id }
    } satisfies Partial<ApplicationError>)
    expect(assetRepository.replaceCustomFieldValues).not.toHaveBeenCalled()
  })

  it("rejects value replacements with duplicate custom field ids", async () => {
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
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: [
          { fieldId: definition.id, value: 1 },
          { fieldId: definition.id, value: 2 }
        ]
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field_value.duplicate",
      kind: "validation",
      details: { assetId: asset.id, fieldId: definition.id }
    } satisfies Partial<ApplicationError>)
    expect(assetRepository.replaceCustomFieldValues).not.toHaveBeenCalled()
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
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "stage"
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field_value.invalid",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: definition.id,
        fieldKey: definition.key
      }
    } satisfies Partial<ApplicationError>)
  })

  it("forwards valid custom field value replacements", async () => {
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
    assetRepository.replaceCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.replaceCustomFieldValues({
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
    expect(assetRepository.replaceCustomFieldValues).toHaveBeenCalledWith(
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
    assetRepository.replaceCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.replaceCustomFieldValues({
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

  it("forwards valid text custom field value replacements", async () => {
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
    assetRepository.replaceCustomFieldValues.mockResolvedValue(values)

    await expect(
      assetService.replaceCustomFieldValues({
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

  it("maps custom field value replacement failures to an application error", async () => {
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
    assetRepository.replaceCustomFieldValues.mockRejectedValue(
      new Error("replace failed")
    )

    await expect(
      assetService.replaceCustomFieldValues({
        assetId: asset.id,
        values: [
          {
            fieldId: definition.id,
            value: "platform"
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "asset.custom_field_value.replace_failed",
      kind: "unexpected",
      details: { assetId: asset.id }
    } satisfies Partial<ApplicationError>)
  })
})
