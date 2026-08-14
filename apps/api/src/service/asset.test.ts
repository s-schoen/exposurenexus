import { AssetType } from "@exposurenexus/types/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/types/model/asset-custom-field";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { ApplicationError } from "./application-error.js";
import { createAssetService } from "./asset.js";

describe("asset service", () => {
  const domainEvents = createDomainEventCollector();
  const assetRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByName: vi.fn(),
    create: vi.fn(),
    updateOwnerByID: vi.fn(),
    deleteByID: vi.fn(),
    countFindingsByAssetID: vi.fn(),
  };
  const assetCustomFieldReader = {
    listEffectiveValuesForAssets: vi.fn(),
  };
  const userProfileService = {
    getByID: vi.fn(),
  };
  const logger = pino({ enabled: false });
  const eventContext = {
    actor: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    correlationId: "asset-service-request",
  };

  function createTestAssetService() {
    return createAssetService({
      assetRepository,
      assetCustomFieldReader,
      userProfileService,
      domainEventEmitter: domainEvents.emitter,
      logger,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
    assetRepository.countFindingsByAssetID.mockResolvedValue(0);
    assetCustomFieldReader.listEffectiveValuesForAssets.mockImplementation(
      async (assetIds: readonly string[]) => {
        return new Map(assetIds.map((assetId) => [assetId, []]));
      },
    );
  });

  it("lists all assets from the repository", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
      },
    ];
    const assetService = createTestAssetService();

    assetRepository.list.mockResolvedValue(assets);

    await expect(assetService.listAll()).resolves.toEqual(assets);
    expect(assetRepository.list).toHaveBeenCalledOnce();
  });

  it("maps repository list failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.list.mockRejectedValue(new Error("db offline"));

    await expect(assetService.listAll()).rejects.toMatchObject({
      code: "asset.list_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("lists all assets with custom fields through the custom field projection", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.exposurenexus.local",
        type: AssetType.Host,
        ownerId: null,
      },
    ];
    const customFields = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Text,
        value: "platform",
      },
    ];
    const assetService = createTestAssetService();

    assetRepository.list.mockResolvedValue(assets);
    assetCustomFieldReader.listEffectiveValuesForAssets.mockResolvedValue(
      new Map([[assets[0].id, customFields]]),
    );

    await expect(assetService.listAllWithCustomFields()).resolves.toEqual([
      {
        ...assets[0],
        customFields,
      },
    ]);
    expect(assetRepository.list).toHaveBeenCalledOnce();
    expect(assetCustomFieldReader.listEffectiveValuesForAssets).toHaveBeenCalledWith([
      assets[0].id,
    ]);
  });

  it("maps repository list failures for asset custom field projections to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.list.mockRejectedValue(new Error("db offline"));

    await expect(assetService.listAllWithCustomFields()).rejects.toMatchObject({
      code: "asset.list_with_custom_fields_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("preserves custom field projection failures while listing assets with custom fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const error = new ApplicationError({
      code: "asset_custom_field.value.list_for_assets_failed",
      kind: "unexpected",
      message: "failed to hydrate asset custom field values",
      details: { assetIds: [asset.id] },
    });
    const assetService = createTestAssetService();

    assetRepository.list.mockResolvedValue([asset]);
    assetCustomFieldReader.listEffectiveValuesForAssets.mockRejectedValue(error);

    await expect(assetService.listAllWithCustomFields()).rejects.toBe(error);
  });

  it("returns an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
    };
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue(asset);

    await expect(assetService.getByID(asset.id)).resolves.toEqual(asset);
    expect(assetRepository.getByID).toHaveBeenCalledWith(asset.id);
  });

  it("returns null when an asset does not exist", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(assetService.getByID(assetId)).resolves.toBeNull();
  });

  it("maps repository get by id failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.getByID.mockRejectedValue(new Error("select failed"));

    await expect(
      assetService.getByID("76b1885f-2d28-4b7d-93da-2751ff385aa3"),
    ).rejects.toMatchObject({
      code: "asset.get_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" },
    } satisfies Partial<ApplicationError>);
  });

  it("passes the lookup name and type to the repository", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
    };
    const assetService = createTestAssetService();

    assetRepository.getByName.mockResolvedValue(asset);

    await expect(assetService.getByName(asset.name, asset.type)).resolves.toEqual(asset);
    expect(assetRepository.getByName).toHaveBeenCalledWith(asset.name, asset.type);
  });

  it("returns null when an asset name lookup does not match", async () => {
    const assetService = createTestAssetService();

    assetRepository.getByName.mockResolvedValue(null);

    await expect(
      assetService.getByName("missing.exposurenexus.local", AssetType.Host),
    ).resolves.toBeNull();
  });

  it("maps repository get by name failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.getByName.mockRejectedValue(new Error("select failed"));

    await expect(
      assetService.getByName("api.exposurenexus.local", AssetType.Host),
    ).rejects.toMatchObject({
      code: "asset.get_by_name_failed",
      kind: "unexpected",
      details: {
        assetName: "api.exposurenexus.local",
        assetType: AssetType.Host,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("creates assets with a generated repository id", async () => {
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
    };
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ownerId: null,
      ...payload,
    };
    const assetService = createTestAssetService();

    assetRepository.create.mockResolvedValue(createdAsset);

    await expect(assetService.create(payload, eventContext)).resolves.toEqual(createdAsset);
    expect(userProfileService.getByID).not.toHaveBeenCalled();
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ownerId: null,
      ...payload,
    });
    expect(domainEvents.subjects()).toEqual(["asset.created"]);
    expect(domainEvents.eventsFor("asset.created")[0]).toMatchObject({
      subject: "asset.created",
      source: "asset",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        asset: {
          ...createdAsset,
          customFields: [],
        },
      },
    });
  });

  it("creates assets with an existing enabled owner", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId,
    };
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload,
    };
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: true,
      roleIds: [],
    });
    assetRepository.create.mockResolvedValue(createdAsset);

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset);
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId);
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload,
    });
  });

  it("creates assets with an existing disabled owner", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const payload = {
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId,
    };
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload,
    };
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: [],
    });
    assetRepository.create.mockResolvedValue(createdAsset);

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset);
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId);
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload,
    });
  });

  it("rejects unknown asset owners before creating assets", async () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue(null);

    await expect(
      assetService.create({
        name: "worker.exposurenexus.local",
        type: AssetType.Host,
        ownerId,
      }),
    ).rejects.toMatchObject({
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.create).not.toHaveBeenCalled();
  });

  it("maps repository create failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.create.mockRejectedValue(new Error("insert failed"));

    await expect(
      assetService.create({
        name: "worker.exposurenexus.local",
        type: AssetType.Host,
      }),
    ).rejects.toMatchObject({
      code: "asset.create_failed",
      kind: "unexpected",
      details: {
        assetName: "worker.exposurenexus.local",
        assetType: AssetType.Host,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("clears asset owners", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const assetService = createTestAssetService();

    assetRepository.getByID
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      })
      .mockResolvedValueOnce(updatedAsset);
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset);

    await expect(
      assetService.updateOwnerByID({ id: assetId, ownerId: null, eventContext }),
    ).resolves.toEqual(updatedAsset);
    expect(userProfileService.getByID).not.toHaveBeenCalled();
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(assetId, null);
    expect(domainEvents.subjects()).toEqual(["asset.updated"]);
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        previous: {
          ...updatedAsset,
          ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
          customFields: [],
        },
        current: {
          ...updatedAsset,
          customFields: [],
        },
      },
    });
  });

  it("updates asset owners to existing enabled users", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId,
    };
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: true,
      roleIds: [],
    });
    assetRepository.getByID
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: null,
      })
      .mockResolvedValueOnce(updatedAsset);
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset);

    await expect(assetService.updateOwnerByID({ id: assetId, ownerId })).resolves.toEqual(
      updatedAsset,
    );
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId);
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(assetId, ownerId);
  });

  it("updates asset owners to existing disabled users", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const updatedAsset = {
      id: assetId,
      name: "worker.exposurenexus.local",
      type: AssetType.Host,
      ownerId,
    };
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue({
      id: ownerId,
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: [],
    });
    assetRepository.getByID
      .mockResolvedValueOnce({
        ...updatedAsset,
        ownerId: null,
      })
      .mockResolvedValueOnce(updatedAsset);
    assetRepository.updateOwnerByID.mockResolvedValue(updatedAsset);

    await expect(assetService.updateOwnerByID({ id: assetId, ownerId })).resolves.toEqual(
      updatedAsset,
    );
    expect(userProfileService.getByID).toHaveBeenCalledWith(ownerId);
    expect(assetRepository.updateOwnerByID).toHaveBeenCalledWith(assetId, ownerId);
  });

  it("rejects unknown asset owner updates before changing assets", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const assetService = createTestAssetService();

    userProfileService.getByID.mockResolvedValue(null);

    await expect(assetService.updateOwnerByID({ id: assetId, ownerId })).rejects.toMatchObject({
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.updateOwnerByID).not.toHaveBeenCalled();
  });

  it("returns null when updating the owner of a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(assetService.updateOwnerByID({ id: assetId, ownerId: null })).resolves.toBeNull();
    expect(assetRepository.updateOwnerByID).not.toHaveBeenCalled();
  });

  it("maps repository owner update failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue({
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    });
    assetRepository.updateOwnerByID.mockRejectedValue(new Error("update failed"));

    await expect(
      assetService.updateOwnerByID({
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        ownerId: null,
      }),
    ).rejects.toMatchObject({
      code: "asset.owner_update_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" },
    } satisfies Partial<ApplicationError>);
  });

  it("deletes an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
    };
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue({
      ...asset,
      ownerId: null,
    });
    assetRepository.deleteByID.mockResolvedValue(asset);

    await expect(assetService.deleteByID(asset.id, eventContext)).resolves.toEqual(asset);
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(asset.id);
    expect(assetRepository.countFindingsByAssetID.mock.invocationCallOrder[0]).toBeLessThan(
      assetRepository.deleteByID.mock.invocationCallOrder[0],
    );
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id);
    expect(domainEvents.subjects()).toEqual(["asset.deleted"]);
    expect(domainEvents.eventsFor("asset.deleted")[0]).toMatchObject({
      subject: "asset.deleted",
      source: "asset",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        asset: {
          ...asset,
          ownerId: null,
          customFields: [],
        },
      },
    });
  });

  it("returns null when deleting a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3";
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(assetService.deleteByID(assetId)).resolves.toBeNull();
    expect(assetRepository.countFindingsByAssetID).not.toHaveBeenCalled();
    expect(assetRepository.deleteByID).not.toHaveBeenCalled();
  });

  it("rejects deleting an asset linked to findings", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: [],
    };
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      ownerId: asset.ownerId,
    });
    assetRepository.countFindingsByAssetID.mockResolvedValue(2);

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(asset.id);
    expect(assetRepository.deleteByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("maps database reference conflicts during asset deletion to 409", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      customFields: [],
    };
    const assetService = createTestAssetService();
    const foreignKeyError = Object.assign(new Error("violates foreign key constraint"), {
      code: "23503",
    });

    assetRepository.getByID.mockResolvedValue({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      ownerId: asset.ownerId,
    });
    assetRepository.deleteByID.mockRejectedValue(foreignKeyError);

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.countFindingsByAssetID).toHaveBeenCalledWith(asset.id);
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id);
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("maps repository delete failures to an application error", async () => {
    const assetService = createTestAssetService();

    assetRepository.getByID.mockResolvedValue({
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    });
    assetRepository.deleteByID.mockRejectedValue(new Error("delete failed"));

    await expect(
      assetService.deleteByID("76b1885f-2d28-4b7d-93da-2751ff385aa3"),
    ).rejects.toMatchObject({
      code: "asset.delete_failed",
      kind: "unexpected",
      details: { assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3" },
    } satisfies Partial<ApplicationError>);
  });
});
