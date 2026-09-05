import { AssetType } from "@exposurenexus/contracts/model/asset";
import {
  ASSET_CUSTOM_FIELD_RESERVED_KEYS,
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  type CreateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldDefinition,
  type UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAssetCustomFields } from "./custom-fields.js";

import type { ApplicationError } from "../application-error.js";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

interface TestEventContext {
  actor?: string;
  correlationId?: string;
}

interface TestEvent {
  subject: string;
  source: string;
  actor?: string;
  correlationId?: string;
  data: unknown;
}

const domainEvents = (() => {
  const events: TestEvent[] = [];

  return {
    record(subject: string, source: string, data: unknown, context?: TestEventContext) {
      events.push({ subject, source, data, ...context });
    },
    clear() {
      events.length = 0;
    },
    eventsFor(subject: string) {
      return events.filter((event) => event.subject === subject);
    },
  };
})();

describe("asset custom fields", () => {
  const assetCustomFieldRepository = {
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
  const assetRepository = {
    getByID: vi.fn(),
  };
  const database = {
    transaction: vi.fn(),
  };
  const transaction = {
    setIsolationLevel: vi.fn(),
    execute: vi.fn(),
  };
  const userProfileLookup = {
    getByID: vi.fn(),
  };
  const logger = pino({ enabled: false });
  const eventContext = {
    actor: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    correlationId: "asset-custom-field-service-request",
  };
  const user = {
    id: eventContext.actor,
    username: "custom-field-test-user",
    displayName: "Custom Field Test User",
    email: "custom-field-test@example.com",
    enabled: true,
    roleIds: [],
  } satisfies UserProfile;

  function assetCustomFieldMutation<T>(
    values: T[],
    previousAsset: object,
    previousValues: unknown[],
    currentAsset: object = previousAsset,
    currentValues: unknown[] = values,
  ) {
    return {
      values,
      previous: { ...previousAsset, customFields: previousValues },
      current: { ...currentAsset, customFields: currentValues },
    };
  }

  function definitionMutation<TPrevious, TCurrent>(previous: TPrevious, current: TCurrent) {
    return { previous, current };
  }

  function createTestAssetCustomFieldService() {
    const customFields = createAssetCustomFields({
      database: database as never,
      assetCustomFieldPersistence: {
        listDefinitions: (_executor) => assetCustomFieldRepository.listDefinitions(),
        getDefinitionByID: (_executor, id) => assetCustomFieldRepository.getDefinitionByID(id),
        insertDefinition: (_executor, definition) =>
          assetCustomFieldRepository.createDefinition(definition),
        updateDefinition: (_executor, options) =>
          assetCustomFieldRepository.updateDefinitionByID(options.id, options.definition),
        deleteDefinition: (_executor, id) => assetCustomFieldRepository.deleteDefinitionByID(id),
        replaceAssignments: (_executor, options) =>
          assetCustomFieldRepository.replaceAssignmentsForAsset(
            options.assetId,
            options.fieldIds,
            options.audit,
          ),
        replaceValues: (_executor, options) =>
          assetCustomFieldRepository.replaceValuesForAsset(
            options.assetId,
            options.values,
            options.audit,
          ),
      },
      assetProjection: {
        getAssetSnapshot: async (_executor, id) => {
          const asset = await assetRepository.getByID(id);
          if (!asset) {
            return null;
          }

          const values = await assetCustomFieldRepository.listEffectiveValuesForAsset(id);
          return { ...asset, customFields: values ?? [] };
        },
        listEffectiveValuesForAsset: (_executor, id) =>
          assetCustomFieldRepository.listEffectiveValuesForAsset(id),
        listEffectiveValuesForAssets: (_executor, ids) =>
          assetCustomFieldRepository.listEffectiveValuesForAssets(ids),
        listAvailableDefinitionsForAsset: (_executor, id) =>
          assetCustomFieldRepository.listAvailableDefinitionsForAsset(id),
      },
      userProfileLookup: {
        getByID: (_executor, id) => userProfileLookup.getByID(id),
      },
      logger,
    });

    return {
      listDefinitions: customFields.listDefinitions.bind(customFields),
      getDefinitionByID: customFields.getDefinitionByID.bind(customFields),
      listEffectiveValuesForAsset: customFields.listEffectiveValuesForAsset.bind(customFields),
      listEffectiveValuesForAssets: customFields.listEffectiveValuesForAssets.bind(customFields),
      listAvailableDefinitionsForAsset:
        customFields.listAvailableDefinitionsForAsset.bind(customFields),
      async createDefinition(
        definition: CreateAssetCustomFieldDefinition,
        context?: TestEventContext,
      ) {
        const outcome = await customFields.createDefinition({
          definition,
          performedBy: context?.actor ?? user.id,
        });
        domainEvents.record(
          "custom-field.created",
          "asset-custom-field",
          { customFieldDefinition: outcome.current },
          context,
        );
        return outcome.current;
      },
      async updateDefinitionByID(opts: {
        id: string;
        definition: UpdateAssetCustomFieldDefinition;
        eventContext?: TestEventContext;
      }) {
        const outcome = await customFields.updateDefinitionByID({
          id: opts.id,
          definition: opts.definition,
          performedBy: opts.eventContext?.actor ?? user.id,
        });
        if (outcome?.changed) {
          domainEvents.record(
            "custom-field.updated",
            "asset-custom-field",
            { previous: outcome.previous, current: outcome.current },
            opts.eventContext,
          );
        }
        return outcome?.current ?? null;
      },
      async deleteDefinitionByID(id: string, context?: TestEventContext) {
        const outcome = await customFields.deleteDefinitionByID({
          id,
          performedBy: context?.actor ?? user.id,
        });
        if (outcome) {
          domainEvents.record(
            "custom-field.deleted",
            "asset-custom-field",
            { customFieldDefinition: outcome.previous },
            context,
          );
        }
        return outcome?.previous ?? null;
      },
      async replaceAssignmentsForAsset(opts: {
        assetId: string;
        fieldIds: string[];
        user: UserProfile;
        eventContext?: TestEventContext;
      }) {
        const outcome = await customFields.replaceAssignmentsForAsset({
          assetId: opts.assetId,
          fieldIds: opts.fieldIds,
          performedBy: opts.user.id,
        });
        if (outcome?.changed) {
          domainEvents.record(
            "asset.updated",
            "asset",
            { previous: outcome.previous, current: outcome.current },
            opts.eventContext,
          );
        }
        return outcome?.values ?? null;
      },
      async replaceValuesForAsset(opts: {
        assetId: string;
        values: UpdateAssetCustomFieldValue[];
        user: UserProfile;
        eventContext?: TestEventContext;
      }) {
        const outcome = await customFields.replaceValuesForAsset({
          assetId: opts.assetId,
          values: opts.values,
          performedBy: opts.user.id,
        });
        if (outcome?.changed) {
          domainEvents.record(
            "asset.updated",
            "asset",
            { previous: outcome.previous, current: outcome.current },
            opts.eventContext,
          );
        }
        return outcome?.values ?? null;
      },
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    domainEvents.clear();
    database.transaction.mockReturnValue(transaction);
    transaction.setIsolationLevel.mockReturnValue(transaction);
    transaction.execute.mockImplementation(
      async (callback: (executor: typeof database) => unknown) => await callback(database),
    );
    userProfileLookup.getByID.mockResolvedValue(user);
  });

  it("lists custom field definitions from the repository", async () => {
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.listDefinitions.mockResolvedValue(definitions);

    await expect(service.listDefinitions()).resolves.toEqual(definitions);
    expect(assetCustomFieldRepository.listDefinitions).toHaveBeenCalledOnce();
  });

  it("maps custom field definition list failures to an application error", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.listDefinitions.mockRejectedValue(new Error("select failed"));

    await expect(service.listDefinitions()).rejects.toMatchObject({
      code: "asset_custom_field.definition.list_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("returns a custom field definition by id", async () => {
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(definition);

    await expect(service.getDefinitionByID(definition.id)).resolves.toEqual(definition);
    expect(assetCustomFieldRepository.getDefinitionByID).toHaveBeenCalledWith(definition.id);
  });

  it("returns null when a custom field definition does not exist", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(null);

    await expect(
      service.getDefinitionByID("5bde818a-bb4f-4a0f-a5eb-a190d5142a25"),
    ).resolves.toBeNull();
  });

  it("maps custom field definition get failures to an application error", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockRejectedValue(new Error("select failed"));

    await expect(
      service.getDefinitionByID("5bde818a-bb4f-4a0f-a5eb-a190d5142a25"),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.get_failed",
      kind: "unexpected",
      details: { fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25" },
    } satisfies Partial<ApplicationError>);
  });

  it("lists effective custom field values for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: "host",
      ownerId: null,
    };
    const values = [
      {
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        source: "default",
        type: AssetCustomFieldType.Text,
        value: "platform",
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue(values);

    await expect(service.listEffectiveValuesForAsset(asset.id)).resolves.toEqual(values);
    expect(assetRepository.getByID).toHaveBeenCalledWith(asset.id);
    expect(assetCustomFieldRepository.listEffectiveValuesForAsset).toHaveBeenCalledWith(asset.id);
  });

  it("returns null when listing effective values for a missing asset", async () => {
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(
      service.listEffectiveValuesForAsset("76b1885f-2d28-4b7d-93da-2751ff385aa3"),
    ).resolves.toBeNull();
    expect(assetCustomFieldRepository.listEffectiveValuesForAsset).not.toHaveBeenCalled();
  });

  it("maps effective value list failures to an application error", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: "host",
      ownerId: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockRejectedValue(
      new Error("select failed"),
    );

    await expect(service.listEffectiveValuesForAsset(asset.id)).rejects.toMatchObject({
      code: "asset_custom_field.value.list_failed",
      kind: "unexpected",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
  });

  it("lists effective values for asset projections", async () => {
    const assetIds = ["76b1885f-2d28-4b7d-93da-2751ff385aa3"];
    const valuesByAssetId = new Map([[assetIds[0], []]]);
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.listEffectiveValuesForAssets.mockResolvedValue(valuesByAssetId);

    await expect(service.listEffectiveValuesForAssets(assetIds)).resolves.toBe(valuesByAssetId);
    expect(assetCustomFieldRepository.listEffectiveValuesForAssets).toHaveBeenCalledWith(assetIds);
  });

  it("maps projection value list failures to an application error", async () => {
    const assetIds = ["76b1885f-2d28-4b7d-93da-2751ff385aa3"];
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.listEffectiveValuesForAssets.mockRejectedValue(
      new Error("select failed"),
    );

    await expect(service.listEffectiveValuesForAssets(assetIds)).rejects.toMatchObject({
      code: "asset_custom_field.value.list_for_assets_failed",
      kind: "unexpected",
      details: { assetIds },
    } satisfies Partial<ApplicationError>);
  });

  it("lists custom field definitions available for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: "host",
      ownerId: null,
    };
    const definitions = [
      {
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listAvailableDefinitionsForAsset.mockResolvedValue(definitions);

    await expect(service.listAvailableDefinitionsForAsset(asset.id)).resolves.toEqual(definitions);
    expect(assetCustomFieldRepository.listAvailableDefinitionsForAsset).toHaveBeenCalledWith(
      asset.id,
    );
  });

  it("returns null when listing available custom fields for a missing asset", async () => {
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(
      service.listAvailableDefinitionsForAsset("76b1885f-2d28-4b7d-93da-2751ff385aa3"),
    ).resolves.toBeNull();
    expect(assetCustomFieldRepository.listAvailableDefinitionsForAsset).not.toHaveBeenCalled();
  });

  it("maps available custom field list failures to an application error", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: "host",
      ownerId: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listAvailableDefinitionsForAsset.mockRejectedValue(
      new Error("select failed"),
    );

    await expect(service.listAvailableDefinitionsForAsset(asset.id)).rejects.toMatchObject({
      code: "asset_custom_field.definition.list_available_failed",
      kind: "unexpected",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
  });

  it("replaces custom field assignments for an existing asset", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const values = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(values);
    assetCustomFieldRepository.listDefinitions.mockResolvedValue([definition]);
    assetCustomFieldRepository.replaceAssignmentsForAsset.mockResolvedValue(
      assetCustomFieldMutation(values, asset, [], asset, values),
    );

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: asset.id,
        user,
        fieldIds: [definition.id],
        eventContext,
      }),
    ).resolves.toEqual(values);
    expect(assetCustomFieldRepository.replaceAssignmentsForAsset).toHaveBeenCalledWith(
      asset.id,
      [definition.id],
      expect.objectContaining({ updatedBy: user.id, updatedAt: expect.any(Date) }),
    );
    expect(domainEvents.eventsFor("asset.updated")).toMatchObject([
      {
        source: "asset",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: {
          previous: { ...asset, customFields: [] },
          current: { ...asset, customFields: values },
        },
      },
    ]);
  });

  it("returns null when replacing custom field assignments for a missing asset", async () => {
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        user,
        fieldIds: ["5bde818a-bb4f-4a0f-a5eb-a190d5142a25"],
      }),
    ).resolves.toBeNull();
    expect(assetCustomFieldRepository.listDefinitions).not.toHaveBeenCalled();
    expect(assetCustomFieldRepository.replaceAssignmentsForAsset).not.toHaveBeenCalled();
  });

  it("rejects replacing assignments with unknown custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25";
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([]);
    assetCustomFieldRepository.listDefinitions.mockResolvedValue([]);

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: asset.id,
        user,
        fieldIds: [fieldId],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.unknown",
      kind: "validation",
      details: { fieldId },
    } satisfies Partial<ApplicationError>);
    expect(assetCustomFieldRepository.replaceAssignmentsForAsset).not.toHaveBeenCalled();
  });

  it("rejects replacing assignments with duplicate custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const fieldId = "5bde818a-bb4f-4a0f-a5eb-a190d5142a25";
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([]);

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: asset.id,
        user,
        fieldIds: [fieldId, fieldId],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.assignment.duplicate",
      kind: "validation",
      details: { assetId: asset.id, fieldId },
    } satisfies Partial<ApplicationError>);
    expect(assetCustomFieldRepository.listDefinitions).not.toHaveBeenCalled();
    expect(assetCustomFieldRepository.replaceAssignmentsForAsset).not.toHaveBeenCalled();
  });

  it("does not emit asset update events when assignment changes do not change the effective snapshot", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const values = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue(values);
    assetCustomFieldRepository.listDefinitions.mockResolvedValue([definition]);
    assetCustomFieldRepository.replaceAssignmentsForAsset.mockResolvedValue(
      assetCustomFieldMutation(values, asset, values),
    );

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: asset.id,
        user,
        fieldIds: [definition.id],
        eventContext,
      }),
    ).resolves.toEqual(values);
    expect(domainEvents.eventsFor("asset.updated")).toEqual([]);
  });

  it("maps custom field assignment replacement failures to an application error", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([]);
    assetCustomFieldRepository.listDefinitions.mockResolvedValue([definition]);
    assetCustomFieldRepository.replaceAssignmentsForAsset.mockRejectedValue(
      new Error("insert failed"),
    );

    await expect(
      service.replaceAssignmentsForAsset({
        assetId: asset.id,
        user,
        fieldIds: [definition.id],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.assignment.replace_failed",
      kind: "unexpected",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
  });

  it("returns null when replacing custom field values for a missing asset", async () => {
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(null);

    await expect(
      service.replaceValuesForAsset({
        assetId: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        user,
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform",
          },
        ],
      }),
    ).resolves.toBeNull();
    expect(assetCustomFieldRepository.replaceValuesForAsset).not.toHaveBeenCalled();
  });

  it("rejects value replacements for unassigned custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([]);

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
            value: "platform",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.not_assigned",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects invalid custom field value types", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null,
      },
    ]);

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: "high",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.invalid",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: definition.id,
        fieldKey: definition.key,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects value replacements that omit assigned custom fields", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null,
      },
    ]);

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.missing",
      kind: "validation",
      details: { assetId: asset.id, fieldId: definition.id },
    } satisfies Partial<ApplicationError>);
    expect(assetCustomFieldRepository.replaceValuesForAsset).not.toHaveBeenCalled();
  });

  it("rejects value replacements with duplicate custom field ids", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null,
      },
    ]);

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          { fieldId: definition.id, value: 1 },
          { fieldId: definition.id, value: 2 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.duplicate",
      kind: "validation",
      details: { assetId: asset.id, fieldId: definition.id },
    } satisfies Partial<ApplicationError>);
    expect(assetCustomFieldRepository.replaceValuesForAsset).not.toHaveBeenCalled();
  });

  it("rejects select custom field values outside the option set", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "deployment_tier",
      name: "Deployment tier",
      required: false,
      type: AssetCustomFieldType.Select,
      defaultValue: null,
      options: [
        {
          id: "2db67190-9d84-482f-9936-cfbf4244752b",
          fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          value: "prod",
          label: "Production",
        },
      ],
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Select,
        value: null,
        options: definition.options,
      },
    ]);

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: "stage",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.invalid",
      kind: "validation",
      details: {
        assetId: asset.id,
        fieldId: definition.id,
        fieldKey: definition.key,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("replaces custom field values and emits changed asset snapshots", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    };
    const values = [
      {
        fieldId: definition.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 5,
      },
    ];
    const previousValues = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Number,
        value: null,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset
      .mockResolvedValueOnce(previousValues)
      .mockResolvedValueOnce(values);
    assetCustomFieldRepository.replaceValuesForAsset.mockResolvedValue(
      assetCustomFieldMutation(values, asset, previousValues, asset, values),
    );

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: 5,
          },
        ],
        eventContext,
      }),
    ).resolves.toEqual(values);
    expect(assetCustomFieldRepository.replaceValuesForAsset).toHaveBeenCalledWith(
      asset.id,
      [{ fieldId: definition.id, value: 5 }],
      expect.objectContaining({ updatedBy: user.id, updatedAt: expect.any(Date) }),
    );
    expect(domainEvents.eventsFor("asset.updated")).toMatchObject([
      {
        subject: "asset.updated",
        source: "asset",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: {
          previous: {
            ...asset,
            customFields: previousValues,
          },
          current: {
            ...asset,
            customFields: values,
          },
        },
      },
    ]);
  });

  it("separates persisted audit attribution from event actor metadata", async () => {
    const persistedUser = { id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12" } as UserProfile;
    const distinctEventContext = {
      actor: "95d5909c-a9ab-4350-a515-4b89eb1065ae",
      correlationId: "asset-custom-field-distinct-actor-request",
    };
    const previous = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedBy: persistedUser.id,
    };
    const current = {
      ...previous,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedBy: persistedUser.id,
    };
    const definition = {
      fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      source: AssetCustomFieldValueSource.Empty,
      type: AssetCustomFieldType.Number,
      value: null,
    };
    const updatedValue = { ...definition, value: 5 };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetCustomFieldRepository.listEffectiveValuesForAsset
      .mockResolvedValueOnce([definition])
      .mockResolvedValueOnce([updatedValue]);
    assetCustomFieldRepository.replaceValuesForAsset.mockResolvedValue(
      assetCustomFieldMutation([updatedValue], previous, [definition], current, [updatedValue]),
    );

    await expect(
      service.replaceValuesForAsset({
        assetId: previous.id,
        user: persistedUser,
        values: [{ fieldId: definition.fieldId, value: 5 }],
        eventContext: distinctEventContext,
      }),
    ).resolves.toEqual([updatedValue]);

    expect(assetCustomFieldRepository.replaceValuesForAsset).toHaveBeenCalledWith(
      previous.id,
      [{ fieldId: definition.fieldId, value: 5 }],
      { updatedAt: expect.any(Date), updatedBy: persistedUser.id },
    );
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      actor: distinctEventContext.actor,
      correlationId: distinctEventContext.correlationId,
      data: {
        previous: { ...previous, customFields: [definition] },
        current: { ...current, customFields: [updatedValue] },
      },
    });
  });

  it("does not emit asset update events for unchanged custom field values", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Number,
      defaultValue: null,
    };
    const values = [
      {
        fieldId: definition.id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 5,
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue(values);
    assetCustomFieldRepository.replaceValuesForAsset.mockResolvedValue(
      assetCustomFieldMutation(values, asset, values),
    );

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: 5,
          },
        ],
        eventContext,
      }),
    ).resolves.toEqual(values);
    expect(domainEvents.eventsFor("asset.updated")).toEqual([]);
  });

  it("replaces text custom field values", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const previousValues = [
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null,
      },
    ];
    const values = [
      {
        fieldId: definition.id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "platform",
      },
    ];
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset
      .mockResolvedValueOnce(previousValues)
      .mockResolvedValueOnce(values);
    assetCustomFieldRepository.replaceValuesForAsset.mockResolvedValue(
      assetCustomFieldMutation(values, asset, previousValues, asset, values),
    );

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: "platform",
          },
        ],
      }),
    ).resolves.toEqual(values);
  });

  it("maps custom field value replacement failures to an application error", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetRepository.getByID.mockResolvedValue(asset);
    assetCustomFieldRepository.listEffectiveValuesForAsset.mockResolvedValue([
      {
        fieldId: definition.id,
        key: definition.key,
        name: definition.name,
        source: AssetCustomFieldValueSource.Empty,
        type: AssetCustomFieldType.Text,
        value: null,
      },
    ]);
    assetCustomFieldRepository.replaceValuesForAsset.mockRejectedValue(new Error("replace failed"));

    await expect(
      service.replaceValuesForAsset({
        assetId: asset.id,
        user,
        values: [
          {
            fieldId: definition.id,
            value: "platform",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.value.replace_failed",
      kind: "unexpected",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
  });

  it("creates a valid custom field definition", async () => {
    const payload: UpdateAssetCustomFieldDefinition = {
      key: "deployment_tier",
      name: "Deployment tier",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "prod",
      options: [
        { value: "prod", label: "Production" },
        { value: "stage", label: "Staging" },
      ],
    };
    const created = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload,
      options: payload.options.map((option) => ({
        id: crypto.randomUUID(),
        fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        ...option,
      })),
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.createDefinition.mockResolvedValue(created);

    await expect(service.createDefinition(payload, eventContext)).resolves.toEqual(created);
    expect(assetCustomFieldRepository.createDefinition).toHaveBeenCalledWith(payload);
    expect(domainEvents.eventsFor("custom-field.created")).toMatchObject([
      {
        source: "asset-custom-field",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { customFieldDefinition: created },
      },
    ]);
  });

  it("rejects required custom fields without defaults", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"],
      },
    } satisfies Partial<ApplicationError>);
    expect(assetCustomFieldRepository.createDefinition).not.toHaveBeenCalled();
  });

  it("rejects reserved core asset metadata keys on create and update", async () => {
    const service = createTestAssetCustomFieldService();

    for (const key of ASSET_CUSTOM_FIELD_RESERVED_KEYS) {
      const definition = {
        key,
        name: "Core metadata",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      } as const;

      await expect(service.createDefinition(definition)).rejects.toMatchObject({
        code: "asset_custom_field.definition.rule_violation",
        kind: "validation",
        details: {
          reason: AssetCustomFieldRuleViolationReason.ReservedKey,
          path: ["key"],
        },
      } satisfies Partial<ApplicationError>);

      await expect(
        service.updateDefinitionByID({
          id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
          definition,
        }),
      ).rejects.toMatchObject({
        code: "asset_custom_field.definition.rule_violation",
        kind: "validation",
        details: {
          reason: AssetCustomFieldRuleViolationReason.ReservedKey,
          path: ["key"],
        },
      } satisfies Partial<ApplicationError>);
    }

    expect(assetCustomFieldRepository.createDefinition).not.toHaveBeenCalled();
    expect(assetCustomFieldRepository.getDefinitionByID).not.toHaveBeenCalled();
  });

  it("rejects invalid custom field default types", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high" as never,
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber,
        path: ["defaultValue"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects text custom field defaults that are not strings", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never,
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.TextDefaultMustBeString,
        path: ["defaultValue"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects select custom field defaults that are not strings", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [{ value: "prod", label: "Production" }],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString,
        path: ["defaultValue"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects select defaults that do not match an option", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "dev",
        options: [{ value: "prod", label: "Production" }],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
        path: ["defaultValue"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects duplicate select option values", async () => {
    const service = createTestAssetCustomFieldService();

    await expect(
      service.createDefinition({
        key: "deployment_tier",
        name: "Deployment tier",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: null,
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" },
        ],
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.rule_violation",
      kind: "validation",
      details: {
        reason: AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
        path: ["options"],
      },
    } satisfies Partial<ApplicationError>);
  });

  it("maps custom field definition create conflicts to a conflict application error", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.createDefinition.mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    await expect(
      service.createDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.create_conflict",
      kind: "conflict",
      details: { fieldKey: "category" },
    } satisfies Partial<ApplicationError>);
  });

  it("maps custom field definition create failures to an application error", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.createDefinition.mockRejectedValue(new Error("insert failed"));

    await expect(
      service.createDefinition({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: null,
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.create_failed",
      kind: "unexpected",
      details: { fieldKey: "category" },
    } satisfies Partial<ApplicationError>);
  });

  it("updates valid custom field definitions", async () => {
    const payload: UpdateAssetCustomFieldDefinition = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    };
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const updated = {
      id: previous.id,
      ...payload,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(previous);
    assetCustomFieldRepository.updateDefinitionByID.mockResolvedValue(
      definitionMutation(previous, updated),
    );

    await expect(
      service.updateDefinitionByID({
        id: updated.id,
        definition: payload,
        eventContext,
      }),
    ).resolves.toEqual(updated);
    expect(assetCustomFieldRepository.updateDefinitionByID).toHaveBeenCalledWith(
      updated.id,
      payload,
    );
    expect(domainEvents.eventsFor("custom-field.updated")).toMatchObject([
      {
        source: "asset-custom-field",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { previous, current: updated },
      },
    ]);
  });

  it("does not emit an event for no-op custom field definition updates", async () => {
    const payload: UpdateAssetCustomFieldDefinition = {
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "platform",
    };
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      ...payload,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(definition);
    assetCustomFieldRepository.updateDefinitionByID.mockResolvedValue(
      definitionMutation(definition, definition),
    );

    await expect(
      service.updateDefinitionByID({
        id: definition.id,
        definition: payload,
        eventContext,
      }),
    ).resolves.toEqual(definition);
    expect(domainEvents.eventsFor("custom-field.updated")).toEqual([]);
  });

  it("returns null when updating a missing custom field definition", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(null);

    await expect(
      service.updateDefinitionByID({
        id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null,
        },
      }),
    ).resolves.toBeNull();
    expect(assetCustomFieldRepository.updateDefinitionByID).not.toHaveBeenCalled();
  });

  it("maps custom field definition update conflicts to a conflict application error", async () => {
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "priority",
      name: "Priority",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(previous);
    assetCustomFieldRepository.updateDefinitionByID.mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    await expect(
      service.updateDefinitionByID({
        id: previous.id,
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.update_conflict",
      kind: "conflict",
      details: { fieldId: previous.id, fieldKey: "category" },
    } satisfies Partial<ApplicationError>);
  });

  it("maps custom field definition update failures to an application error", async () => {
    const previous = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.getDefinitionByID.mockResolvedValue(previous);
    assetCustomFieldRepository.updateDefinitionByID.mockRejectedValue(new Error("update failed"));

    await expect(
      service.updateDefinitionByID({
        id: previous.id,
        definition: {
          key: "category",
          name: "Category",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.update_failed",
      kind: "unexpected",
      details: { fieldId: previous.id },
    } satisfies Partial<ApplicationError>);
  });

  it("deletes custom field definitions", async () => {
    const definition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null,
    };
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.deleteDefinitionByID.mockResolvedValue(definition);

    await expect(service.deleteDefinitionByID(definition.id, eventContext)).resolves.toEqual(
      definition,
    );
    expect(domainEvents.eventsFor("custom-field.deleted")).toMatchObject([
      {
        source: "asset-custom-field",
        actor: eventContext.actor,
        correlationId: eventContext.correlationId,
        data: { customFieldDefinition: definition },
      },
    ]);
  });

  it("returns null when deleting a missing custom field definition", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.deleteDefinitionByID.mockResolvedValue(null);

    await expect(
      service.deleteDefinitionByID("5bde818a-bb4f-4a0f-a5eb-a190d5142a25"),
    ).resolves.toBeNull();
  });

  it("maps custom field definition delete failures to an application error", async () => {
    const service = createTestAssetCustomFieldService();

    assetCustomFieldRepository.deleteDefinitionByID.mockRejectedValue(new Error("delete failed"));

    await expect(
      service.deleteDefinitionByID("5bde818a-bb4f-4a0f-a5eb-a190d5142a25"),
    ).rejects.toMatchObject({
      code: "asset_custom_field.definition.delete_failed",
      kind: "unexpected",
      details: { fieldId: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25" },
    } satisfies Partial<ApplicationError>);
  });
});
