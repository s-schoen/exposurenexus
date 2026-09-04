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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateAssetsWithEvents } from "./assets-events.js";

import type { Assets } from "@exposurenexus/backend/assets";

const user = createTestUser({ id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d" });
const eventContext = {
  actor: "95d5909c-a9ab-4350-a515-4b89eb1065ae",
  correlationId: "assets-event-request",
};
const asset = {
  id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
  displayName: "api.exposurenexus.local",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: null,
  identifiers: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdBy: user.id,
  updatedBy: user.id,
};
const previous = { ...asset, customFields: [] };
const current = {
  ...asset,
  displayName: "renamed.exposurenexus.local",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  customFields: [],
};
const identifier = {
  id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
  type: AssetIdentifierType.DnsName,
  namespace: null,
  value: "api.example.com",
};
const definition = {
  id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
  key: "category",
  name: "Category",
  required: false,
  type: AssetCustomFieldType.Text as const,
  defaultValue: null,
};
const customFieldValue = {
  fieldId: definition.id,
  key: definition.key,
  name: definition.name,
  source: AssetCustomFieldValueSource.Asset,
  type: definition.type,
  value: "platform",
};

const inventory = {
  listAll: vi.fn(),
  listAllWithCustomFields: vi.fn(),
  getByID: vi.fn(),
  getByDisplayName: vi.fn(),
  listByDisplayName: vi.fn(),
  create: vi.fn(),
  updateByID: vi.fn(),
  addIdentifier: vi.fn(),
  updateIdentifierByID: vi.fn(),
  deleteIdentifierByID: vi.fn(),
  deleteByID: vi.fn(),
};
const customFields = {
  listDefinitions: vi.fn(),
  getDefinitionByID: vi.fn(),
  createDefinition: vi.fn(),
  updateDefinitionByID: vi.fn(),
  deleteDefinitionByID: vi.fn(),
  listEffectiveValuesForAsset: vi.fn(),
  listEffectiveValuesForAssets: vi.fn(),
  listAvailableDefinitionsForAsset: vi.fn(),
  replaceAssignmentsForAsset: vi.fn(),
  replaceValuesForAsset: vi.fn(),
};
const assets = { inventory, customFields } as unknown as Assets;

describe("assets event decorator", () => {
  const domainEvents = createDomainEventCollector();

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
  });

  it("emits ordered asset events from backend outcomes without compensating reads", async () => {
    const apiAssets = decorateAssetsWithEvents(assets, domainEvents.emitter);
    inventory.create.mockResolvedValue({ asset, current: previous, performedBy: user.id });
    inventory.updateByID.mockResolvedValue({
      asset: current,
      previous,
      current,
      changed: true,
      performedBy: user.id,
    });
    inventory.addIdentifier.mockResolvedValue({
      identifier,
      previous,
      current,
      performedBy: user.id,
    });
    inventory.updateIdentifierByID.mockResolvedValue({
      identifier,
      previous,
      current,
      changed: true,
      performedBy: user.id,
    });
    inventory.deleteIdentifierByID.mockResolvedValue({
      identifier,
      previous,
      current,
      performedBy: user.id,
    });
    inventory.deleteByID.mockResolvedValue({ asset, previous, performedBy: eventContext.actor });

    await expect(
      apiAssets.inventory.create({
        asset: { displayName: asset.displayName, type: asset.type },
        user,
        eventContext,
      }),
    ).resolves.toBe(asset);
    await expect(
      apiAssets.inventory.updateByID({
        id: asset.id,
        asset: { displayName: current.displayName },
        user,
        eventContext,
      }),
    ).resolves.toBe(current);
    await expect(
      apiAssets.inventory.addIdentifier({
        assetId: asset.id,
        identifier,
        user,
        eventContext,
      }),
    ).resolves.toBe(identifier);
    await expect(
      apiAssets.inventory.updateIdentifierByID({
        assetId: asset.id,
        identifierId: identifier.id,
        identifier,
        user,
        eventContext,
      }),
    ).resolves.toBe(identifier);
    await expect(
      apiAssets.inventory.deleteIdentifierByID({
        assetId: asset.id,
        identifierId: identifier.id,
        user,
        eventContext,
      }),
    ).resolves.toBe(identifier);
    await expect(apiAssets.inventory.deleteByID(asset.id, eventContext)).resolves.toBe(asset);

    expect(domainEvents.subjects()).toEqual([
      "asset.created",
      "asset.updated",
      "asset.updated",
      "asset.updated",
      "asset.updated",
      "asset.deleted",
    ]);
    expect(domainEvents.eventsFor("asset.created")[0]).toMatchObject({
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: { asset: previous },
    });
    expect(domainEvents.eventsFor("asset.deleted")[0]).toMatchObject({
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: { asset: previous },
    });
    expect(inventory.create).toHaveBeenCalledWith({
      asset: { displayName: asset.displayName, type: asset.type },
      performedBy: user.id,
    });
    expect(inventory.deleteByID).toHaveBeenCalledWith({
      id: asset.id,
      performedBy: eventContext.actor,
    });
    expect(inventory.getByID).not.toHaveBeenCalled();
    expect(customFields.listEffectiveValuesForAsset).not.toHaveBeenCalled();
  });

  it("suppresses asset events for unchanged backend outcomes", async () => {
    const apiAssets = decorateAssetsWithEvents(assets, domainEvents.emitter);
    inventory.updateByID.mockResolvedValue({
      asset,
      previous,
      current: previous,
      changed: false,
      performedBy: user.id,
    });
    inventory.updateIdentifierByID.mockResolvedValue({
      identifier,
      previous,
      current: previous,
      changed: false,
      performedBy: user.id,
    });

    await apiAssets.inventory.updateByID({ id: asset.id, asset: {}, user, eventContext });
    await apiAssets.inventory.updateIdentifierByID({
      assetId: asset.id,
      identifierId: identifier.id,
      identifier,
      user,
      eventContext,
    });

    expect(domainEvents.subjects()).toEqual([]);
  });

  it("maps custom-field outcomes while preserving event metadata and audit attribution", async () => {
    const apiAssets = decorateAssetsWithEvents(assets, domainEvents.emitter);
    const updatedDefinition = { ...definition, name: "Asset Category" };
    const assetWithCustomFields = { ...current, customFields: [customFieldValue] };
    customFields.createDefinition.mockResolvedValue({
      current: definition,
      performedBy: eventContext.actor,
    });
    customFields.updateDefinitionByID.mockResolvedValue({
      previous: definition,
      current: updatedDefinition,
      changed: true,
      performedBy: eventContext.actor,
    });
    customFields.deleteDefinitionByID.mockResolvedValue({
      previous: updatedDefinition,
      performedBy: eventContext.actor,
    });
    customFields.replaceAssignmentsForAsset.mockResolvedValue({
      values: [customFieldValue],
      previous,
      current: assetWithCustomFields,
      changed: true,
      performedBy: user.id,
    });
    customFields.replaceValuesForAsset.mockResolvedValue({
      values: [customFieldValue],
      previous: assetWithCustomFields,
      current: assetWithCustomFields,
      changed: false,
      performedBy: user.id,
    });

    await expect(apiAssets.customFields.createDefinition(definition, eventContext)).resolves.toBe(
      definition,
    );
    await expect(
      apiAssets.customFields.updateDefinitionByID({
        id: definition.id,
        definition: updatedDefinition,
        eventContext,
      }),
    ).resolves.toBe(updatedDefinition);
    await expect(
      apiAssets.customFields.deleteDefinitionByID(definition.id, eventContext),
    ).resolves.toBe(updatedDefinition);
    await expect(
      apiAssets.customFields.replaceAssignmentsForAsset({
        assetId: asset.id,
        fieldIds: [definition.id],
        user,
        eventContext,
      }),
    ).resolves.toEqual([customFieldValue]);
    await expect(
      apiAssets.customFields.replaceValuesForAsset({
        assetId: asset.id,
        values: [{ fieldId: definition.id, value: customFieldValue.value }],
        user,
        eventContext,
      }),
    ).resolves.toEqual([customFieldValue]);

    expect(domainEvents.subjects()).toEqual([
      "custom-field.created",
      "custom-field.updated",
      "custom-field.deleted",
      "asset.updated",
    ]);
    for (const event of domainEvents.events) {
      expect(event).toMatchObject({
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
      });
    }
    expect(customFields.createDefinition).toHaveBeenCalledWith({
      definition,
      performedBy: eventContext.actor,
    });
    expect(customFields.replaceAssignmentsForAsset).toHaveBeenCalledWith({
      assetId: asset.id,
      fieldIds: [definition.id],
      performedBy: user.id,
    });
    expect(inventory.getByID).not.toHaveBeenCalled();
    expect(customFields.listEffectiveValuesForAsset).not.toHaveBeenCalled();
  });
});
