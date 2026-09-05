import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
  type Asset,
  type AssetIdentifier,
  type AssetWithCustomFields,
  type CreateAsset,
  type CreateAssetIdentifier,
  type UpdateAsset,
  type UpdateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../application-error.js";
import { createAssetInventory } from "./inventory.js";

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
    subjects() {
      return events.map((event) => event.subject);
    },
    eventsFor(subject: string) {
      return events.filter((event) => event.subject === subject);
    },
  };
})();

describe("asset inventory", () => {
  const assetRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByDisplayName: vi.fn(),
    listByDisplayName: vi.fn(),
    getIdentifierByID: vi.fn(),
    getAssetIDByIdentifier: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    addIdentifier: vi.fn(),
    updateIdentifierByID: vi.fn(),
    deleteIdentifierByID: vi.fn(),
    deleteByID: vi.fn(),
    countFindingsByAssetID: vi.fn(),
  };
  const assetCustomFieldReader = {
    listEffectiveValuesForAssets: vi.fn(),
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
  const user: UserProfile = {
    id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    username: "asset-test-user",
    displayName: "Asset Test User",
    email: "asset-test@example.com",
    enabled: true,
    roleIds: [],
  };
  const eventContext = {
    actor: user.id,
    correlationId: "asset-service-request",
  };

  function createAssetFixture(overrides: Partial<Asset> = {}): Asset {
    return {
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
      ...overrides,
    };
  }

  function withCustomFields(asset: Asset): AssetWithCustomFields {
    return { ...asset, customFields: [] };
  }

  function assetMutation(previous: Asset, current: Asset) {
    return { previous: withCustomFields(previous), current: withCustomFields(current) };
  }

  function identifierMutation(identifier: AssetIdentifier, previous: Asset, current: Asset) {
    return { identifier, ...assetMutation(previous, current) };
  }

  type MutationOptions<T> = T & { user: UserProfile; eventContext?: TestEventContext };

  function createTestAssetService() {
    const inventory = createAssetInventory({
      database: database as never,
      assetPersistence: {
        listAssets: (_executor, options) => assetRepository.list(options),
        getAssetByID: (_executor, id) => assetRepository.getByID(id),
        getAssetByDisplayName: (_executor, displayName, type) =>
          assetRepository.getByDisplayName(displayName, type),
        listAssetsByDisplayName: (_executor, displayName, type) =>
          assetRepository.listByDisplayName(displayName, type),
        getAssetIDByIdentifier: (_executor, identifier) =>
          assetRepository.getAssetIDByIdentifier(identifier),
        insertAsset: (_executor, asset) => assetRepository.create(asset),
        updateAsset: (_executor, options) => assetRepository.updateByID(options.id, options.asset),
        addAssetIdentifier: (_executor, options) =>
          assetRepository.addIdentifier(options.assetId, options.identifier, options.audit),
        updateAssetIdentifier: (_executor, options) =>
          assetRepository.updateIdentifierByID(
            options.assetId,
            options.identifierId,
            options.identifier,
            options.audit,
          ),
        deleteAssetIdentifier: (_executor, options) =>
          assetRepository.deleteIdentifierByID(
            options.assetId,
            options.identifierId,
            options.audit,
          ),
        deleteAsset: (_executor, options) => assetRepository.deleteByID(options.id),
        countFindingsByAssetID: (_executor, id) => assetRepository.countFindingsByAssetID(id),
      },
      assetProjection: {
        listEffectiveValuesForAssets: (_executor, assetIds) =>
          assetCustomFieldReader.listEffectiveValuesForAssets(assetIds),
      },
      userProfileLookup: {
        getByID: (_executor, id) => userProfileLookup.getByID(id),
      },
      logger,
    });

    return {
      listAll: inventory.listAll.bind(inventory),
      listAllWithCustomFields: inventory.listAllWithCustomFields.bind(inventory),
      getByID: inventory.getByID.bind(inventory),
      getByDisplayName: inventory.getByDisplayName.bind(inventory),
      listByDisplayName: inventory.listByDisplayName.bind(inventory),
      async create(opts: MutationOptions<{ asset: CreateAsset }>) {
        const outcome = await inventory.create({
          asset: opts.asset,
          performedBy: opts.user.id,
        });
        domainEvents.record(
          "asset.created",
          "asset",
          { asset: outcome.current },
          opts.eventContext,
        );
        return outcome.asset;
      },
      async updateByID(opts: MutationOptions<{ id: string; asset: UpdateAsset }>) {
        const outcome = await inventory.updateByID({
          id: opts.id,
          asset: opts.asset,
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
        return outcome?.asset ?? null;
      },
      async addIdentifier(
        opts: MutationOptions<{ assetId: string; identifier: CreateAssetIdentifier }>,
      ) {
        const outcome = await inventory.addIdentifier({
          assetId: opts.assetId,
          identifier: opts.identifier,
          performedBy: opts.user.id,
        });
        if (outcome) {
          domainEvents.record(
            "asset.updated",
            "asset",
            { previous: outcome.previous, current: outcome.current },
            opts.eventContext,
          );
        }
        return outcome?.identifier ?? null;
      },
      async updateIdentifierByID(
        opts: MutationOptions<{
          assetId: string;
          identifierId: string;
          identifier: UpdateAssetIdentifier;
        }>,
      ) {
        const outcome = await inventory.updateIdentifierByID({
          assetId: opts.assetId,
          identifierId: opts.identifierId,
          identifier: opts.identifier,
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
        return outcome?.identifier ?? null;
      },
      async deleteIdentifierByID(opts: MutationOptions<{ assetId: string; identifierId: string }>) {
        const outcome = await inventory.deleteIdentifierByID({
          assetId: opts.assetId,
          identifierId: opts.identifierId,
          performedBy: opts.user.id,
        });
        if (outcome) {
          domainEvents.record(
            "asset.updated",
            "asset",
            { previous: outcome.previous, current: outcome.current },
            opts.eventContext,
          );
        }
        return outcome?.identifier ?? null;
      },
      async deleteByID(id: string, context?: TestEventContext) {
        const outcome = await inventory.deleteByID({
          id,
          performedBy: context?.actor ?? user.id,
        });
        if (outcome) {
          domainEvents.record("asset.deleted", "asset", { asset: outcome.previous }, context);
        }
        return outcome?.asset ?? null;
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
    assetRepository.countFindingsByAssetID.mockResolvedValue(0);
    userProfileLookup.getByID.mockResolvedValue(user);
    assetCustomFieldReader.listEffectiveValuesForAssets.mockImplementation(
      async (assetIds: readonly string[]) => new Map(assetIds.map((assetId) => [assetId, []])),
    );
  });

  it("lists all assets from the repository", async () => {
    const assets = [createAssetFixture()];
    const assetService = createTestAssetService();
    assetRepository.list.mockResolvedValue(assets);

    await expect(assetService.listAll()).resolves.toEqual(assets);
  });

  it("lists assets by exact display name and type", async () => {
    const assets = [createAssetFixture()];
    const assetService = createTestAssetService();
    assetRepository.listByDisplayName.mockResolvedValue(assets);

    await expect(
      assetService.listByDisplayName("api.exposurenexus.local", AssetType.Host),
    ).resolves.toEqual(assets);
    expect(assetRepository.listByDisplayName).toHaveBeenCalledWith(
      "api.exposurenexus.local",
      AssetType.Host,
    );
  });

  it("gets an asset by exact display name and type", async () => {
    const asset = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByDisplayName.mockResolvedValue(asset);

    await expect(assetService.getByDisplayName(asset.displayName, AssetType.Host)).resolves.toEqual(
      asset,
    );
    expect(assetRepository.getByDisplayName).toHaveBeenCalledWith(
      asset.displayName,
      AssetType.Host,
    );
  });

  it("returns null when a display-name lookup does not match", async () => {
    const assetService = createTestAssetService();
    assetRepository.getByDisplayName.mockResolvedValue(null);

    await expect(
      assetService.getByDisplayName("missing.exposurenexus.local", AssetType.Host),
    ).resolves.toBeNull();
  });

  it("maps display-name lookup failures to an application error", async () => {
    const assetService = createTestAssetService();
    assetRepository.getByDisplayName.mockRejectedValue(new Error("select failed"));

    await expect(
      assetService.getByDisplayName("api.exposurenexus.local", AssetType.Host),
    ).rejects.toMatchObject({
      code: "asset.get_by_name_failed",
      kind: "unexpected",
      details: {
        assetDisplayName: "api.exposurenexus.local",
        assetType: AssetType.Host,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("maps display-name list failures to an application error", async () => {
    const assetService = createTestAssetService();
    assetRepository.listByDisplayName.mockRejectedValue(new Error("select failed"));

    await expect(
      assetService.listByDisplayName("api.exposurenexus.local", AssetType.Host),
    ).rejects.toMatchObject({
      code: "asset.list_by_display_name_failed",
      kind: "unexpected",
      details: {
        assetDisplayName: "api.exposurenexus.local",
        assetType: AssetType.Host,
      },
    } satisfies Partial<ApplicationError>);
  });

  it("lists all assets with effective custom fields", async () => {
    const asset = createAssetFixture();
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
    assetRepository.list.mockResolvedValue([asset]);
    assetCustomFieldReader.listEffectiveValuesForAssets.mockResolvedValue(
      new Map([[asset.id, customFields]]),
    );

    await expect(assetService.listAllWithCustomFields()).resolves.toEqual([
      { ...asset, customFields },
    ]);
  });

  it("passes inventory filters to base and custom-field-hydrated reads", async () => {
    const assets = [createAssetFixture()];
    const filters = {
      search: "api.example.com",
      types: [AssetType.Host],
      environments: [AssetEnvironment.Production],
      lifecycleStates: [AssetLifecycleState.Active],
      ownerIds: [null],
    } as const;
    const assetService = createTestAssetService();
    assetRepository.list.mockResolvedValue(assets);

    await expect(assetService.listAll(filters)).resolves.toEqual(assets);
    await expect(assetService.listAllWithCustomFields(filters)).resolves.toEqual([
      { ...assets[0], customFields: [] },
    ]);

    expect(assetRepository.list).toHaveBeenNthCalledWith(1, filters);
    expect(assetRepository.list).toHaveBeenNthCalledWith(2, filters);
  });

  it("creates assets with server-owned defaults and audit attribution", async () => {
    const now = new Date("2026-02-03T04:05:06.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const created = createAssetFixture({
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      createdAt: now,
      updatedAt: now,
    });
    const assetService = createTestAssetService();
    assetRepository.create.mockResolvedValue(created);

    await expect(
      assetService.create({
        asset: {
          displayName: " api.exposurenexus.local ",
          type: AssetType.Host,
        },
        user,
        eventContext,
      }),
    ).resolves.toEqual(created);

    expect(assetRepository.create).toHaveBeenCalledWith({
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
      identifiers: [],
    });
    expect(domainEvents.eventsFor("asset.created")[0]).toMatchObject({
      actor: user.id,
      correlationId: eventContext.correlationId,
      data: { asset: { ...created, customFields: [] } },
    });
    vi.useRealTimers();
  });

  it("normalizes identifiers during asset creation", async () => {
    const created = createAssetFixture({
      identifiers: [
        {
          id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
          type: AssetIdentifierType.DnsName,
          namespace: null,
          value: "api.example.com",
        },
      ],
    });
    const assetService = createTestAssetService();
    assetRepository.create.mockResolvedValue(created);

    await expect(
      assetService.create({
        asset: {
          displayName: "api.example.com",
          type: AssetType.Host,
          identifiers: [
            {
              type: AssetIdentifierType.DnsName,
              value: "API.Example.com.",
            },
          ],
        },
        user,
      }),
    ).resolves.toEqual(created);

    expect(assetRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        identifiers: [
          {
            type: AssetIdentifierType.DnsName,
            namespace: null,
            value: "api.example.com",
          },
        ],
      }),
    );
  });

  it("rejects duplicate identifiers after normalization", async () => {
    const assetService = createTestAssetService();

    await expect(
      assetService.create({
        asset: {
          displayName: "api.example.com",
          type: AssetType.Host,
          identifiers: [
            { type: AssetIdentifierType.DnsName, value: "API.Example.com." },
            { type: AssetIdentifierType.DnsName, value: "api.example.com" },
          ],
        },
        user,
      }),
    ).rejects.toMatchObject({
      code: "asset.identifier_duplicate",
      kind: "validation",
      details: {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
      },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.create).not.toHaveBeenCalled();
  });

  it("reports the owning asset when creation hits an identifier conflict", async () => {
    const conflictingAssetId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const assetService = createTestAssetService();
    assetRepository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );
    assetRepository.getAssetIDByIdentifier.mockResolvedValue(conflictingAssetId);

    await expect(
      assetService.create({
        asset: {
          displayName: "api.example.com",
          type: AssetType.Host,
          identifiers: [{ type: AssetIdentifierType.DnsName, value: "API.Example.com." }],
        },
        user,
      }),
    ).rejects.toMatchObject({
      code: "asset.identifier_conflict",
      kind: "conflict",
      details: {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
        conflictingAssetId,
      },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.getAssetIDByIdentifier).toHaveBeenCalledWith({
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    });
  });

  it("passes explicit asset metadata and ownership to the repository", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const now = new Date("2026-02-03T04:05:06.000Z");
    const created = createAssetFixture({
      displayName: "api.example.com",
      type: AssetType.CloudResource,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    const assetService = createTestAssetService();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileLookup.getByID.mockResolvedValue({ ...user, id: ownerId });
    assetRepository.create.mockResolvedValue(created);

    await expect(
      assetService.create({
        asset: {
          displayName: " api.example.com ",
          type: AssetType.CloudResource,
          environment: AssetEnvironment.Staging,
          lifecycleState: AssetLifecycleState.Archived,
          ownerId,
        },
        user,
      }),
    ).resolves.toEqual(created);

    expect(assetRepository.create).toHaveBeenCalledWith({
      displayName: "api.example.com",
      type: AssetType.CloudResource,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      ownerId,
      identifiers: [],
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    });
    vi.useRealTimers();
  });

  it("rejects blank display names before creating an asset", async () => {
    const assetService = createTestAssetService();

    await expect(
      assetService.create({ asset: { displayName: "   ", type: AssetType.Host }, user }),
    ).rejects.toMatchObject({
      code: "asset.display_name_invalid",
      kind: "validation",
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.create).not.toHaveBeenCalled();
  });

  it("validates owners while allowing disabled user profiles", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const created = createAssetFixture({ ownerId });
    const assetService = createTestAssetService();
    userProfileLookup.getByID.mockResolvedValue({
      ...user,
      id: ownerId,
      enabled: false,
    });
    assetRepository.create.mockResolvedValue(created);

    await expect(
      assetService.create({
        asset: { displayName: "api.exposurenexus.local", type: AssetType.Host, ownerId },
        user,
      }),
    ).resolves.toEqual(created);
    expect(userProfileLookup.getByID).toHaveBeenCalledWith(ownerId);
  });

  it("rejects unknown owners before creating an asset", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const assetService = createTestAssetService();
    userProfileLookup.getByID.mockResolvedValue(null);

    await expect(
      assetService.create({
        asset: { displayName: "api.exposurenexus.local", type: AssetType.Host, ownerId },
        user,
      }),
    ).rejects.toMatchObject({
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.create).not.toHaveBeenCalled();
  });

  it("updates core metadata with a new audit actor and complete snapshots", async () => {
    const previous = createAssetFixture();
    const now = new Date("2026-02-03T04:05:06.000Z");
    const current = createAssetFixture({
      displayName: "renamed.exposurenexus.local",
      type: AssetType.CloudResource,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      updatedAt: now,
      updatedBy: user.id,
    });
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.updateByID.mockResolvedValue(assetMutation(previous, current));

    await expect(
      assetService.updateByID({
        id: previous.id,
        asset: {
          displayName: " renamed.exposurenexus.local ",
          type: AssetType.CloudResource,
          environment: AssetEnvironment.Staging,
          lifecycleState: AssetLifecycleState.Archived,
        },
        user,
        eventContext,
      }),
    ).resolves.toEqual(current);

    expect(assetRepository.updateByID).toHaveBeenCalledWith(previous.id, {
      displayName: "renamed.exposurenexus.local",
      type: AssetType.CloudResource,
      environment: AssetEnvironment.Staging,
      lifecycleState: AssetLifecycleState.Archived,
      updatedAt: now,
      updatedBy: user.id,
    });
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      actor: user.id,
      data: {
        previous: { ...previous, customFields: [] },
        current: { ...current, customFields: [] },
      },
    });
    vi.useRealTimers();
  });

  it("assigns an existing owner through the core update path", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const previous = createAssetFixture();
    const current = createAssetFixture({ ownerId, updatedBy: user.id });
    const assetService = createTestAssetService();
    userProfileLookup.getByID.mockResolvedValue({ ...user, id: ownerId });
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.updateByID.mockResolvedValue(assetMutation(previous, current));

    await expect(
      assetService.updateByID({
        id: previous.id,
        asset: { ownerId },
        user,
        eventContext,
      }),
    ).resolves.toEqual(current);

    expect(userProfileLookup.getByID).toHaveBeenCalledWith(ownerId);
    expect(assetRepository.updateByID).toHaveBeenCalledWith(
      previous.id,
      expect.objectContaining({ ownerId, updatedBy: user.id, updatedAt: expect.any(Date) }),
    );
    expect(domainEvents.eventsFor("asset.updated")).toHaveLength(1);
  });

  it("clears an existing owner without looking up a profile", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const previous = createAssetFixture({ ownerId });
    const current = createAssetFixture({ updatedBy: user.id });
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.updateByID.mockResolvedValue(assetMutation(previous, current));

    await expect(
      assetService.updateByID({
        id: previous.id,
        asset: { ownerId: null },
        user,
        eventContext,
      }),
    ).resolves.toEqual(current);

    expect(userProfileLookup.getByID).toHaveBeenCalledWith(user.id);
    expect(assetRepository.updateByID).toHaveBeenCalledWith(
      previous.id,
      expect.objectContaining({ ownerId: null }),
    );
  });

  it("rejects unknown owners through the core update path", async () => {
    const ownerId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const asset = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);
    userProfileLookup.getByID.mockResolvedValue(null);

    await expect(
      assetService.updateByID({ id: asset.id, asset: { ownerId }, user }),
    ).rejects.toMatchObject({
      code: "asset.owner_unknown",
      kind: "validation",
      details: { ownerId },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.updateByID).not.toHaveBeenCalled();
  });

  it("does not advance audit metadata or emit an event for a no-op update", async () => {
    const asset = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);

    await expect(
      assetService.updateByID({
        id: asset.id,
        asset: { displayName: asset.displayName, ownerId: asset.ownerId },
        user,
      }),
    ).resolves.toEqual(asset);
    expect(assetRepository.updateByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("rejects empty core metadata updates", async () => {
    const assetService = createTestAssetService();

    await expect(
      assetService.updateByID({ id: "76b1885f-2d28-4b7d-93da-2751ff385aa3", asset: {}, user }),
    ).rejects.toMatchObject({
      code: "asset.update_empty",
      kind: "validation",
    } satisfies Partial<ApplicationError>);
  });

  it("adds identifiers, updates the parent audit fields, and emits complete snapshots", async () => {
    const previous = createAssetFixture();
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.IpAddress,
      namespace: "private",
      value: "192.0.2.1",
    } as const;
    const current = createAssetFixture({
      identifiers: [identifier],
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      updatedBy: user.id,
    });
    vi.useFakeTimers();
    vi.setSystemTime(current.updatedAt);
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.addIdentifier.mockResolvedValue(
      identifierMutation(identifier, previous, current),
    );

    await expect(
      assetService.addIdentifier({
        assetId: previous.id,
        identifier: {
          type: AssetIdentifierType.IpAddress,
          namespace: " private ",
          value: "192.0.2.1",
        },
        user,
        eventContext,
      }),
    ).resolves.toEqual(identifier);

    expect(assetRepository.addIdentifier).toHaveBeenCalledWith(
      previous.id,
      {
        type: identifier.type,
        namespace: identifier.namespace,
        value: identifier.value,
      },
      { updatedAt: current.updatedAt, updatedBy: user.id },
    );
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      data: {
        previous: { ...previous, customFields: [] },
        current: { ...current, customFields: [] },
      },
    });
    vi.useRealTimers();
  });

  it("keeps identifier ids stable when updating and does not audit no-op updates", async () => {
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const asset = createAssetFixture({ identifiers: [identifier] });
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);

    await expect(
      assetService.updateIdentifierByID({
        assetId: asset.id,
        identifierId: identifier.id,
        identifier: { type: identifier.type, value: "API.EXAMPLE.COM." },
        user,
      }),
    ).resolves.toEqual(identifier);
    expect(assetRepository.updateIdentifierByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("updates identifiers and emits snapshots with the new audit metadata", async () => {
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const previous = createAssetFixture({ identifiers: [identifier] });
    const updatedIdentifier = {
      ...identifier,
      namespace: "private",
      value: "api.internal.example.com",
    } as const;
    const current = createAssetFixture({
      identifiers: [updatedIdentifier],
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      updatedBy: user.id,
    });
    const assetService = createTestAssetService();
    vi.useFakeTimers();
    vi.setSystemTime(current.updatedAt);
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.updateIdentifierByID.mockResolvedValue(
      identifierMutation(updatedIdentifier, previous, current),
    );

    await expect(
      assetService.updateIdentifierByID({
        assetId: previous.id,
        identifierId: identifier.id,
        identifier: {
          type: AssetIdentifierType.DnsName,
          namespace: " private ",
          value: "API.INTERNAL.EXAMPLE.COM.",
        },
        user,
        eventContext,
      }),
    ).resolves.toEqual(updatedIdentifier);

    expect(assetRepository.updateIdentifierByID).toHaveBeenCalledWith(
      previous.id,
      identifier.id,
      {
        type: AssetIdentifierType.DnsName,
        namespace: "private",
        value: "api.internal.example.com",
      },
      { updatedAt: current.updatedAt, updatedBy: user.id },
    );
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      data: {
        previous: { ...previous, customFields: [] },
        current: { ...current, customFields: [] },
      },
    });
    vi.useRealTimers();
  });

  it("reports the owning asset when updating an identifier conflicts", async () => {
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const conflictingAssetId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
    const asset = createAssetFixture({ identifiers: [identifier] });
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);
    assetRepository.updateIdentifierByID.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );
    assetRepository.getAssetIDByIdentifier.mockResolvedValue(conflictingAssetId);

    await expect(
      assetService.updateIdentifierByID({
        assetId: asset.id,
        identifierId: identifier.id,
        identifier: { type: AssetIdentifierType.DnsName, value: "other.example.com" },
        user,
      }),
    ).rejects.toMatchObject({
      code: "asset.identifier_conflict",
      kind: "conflict",
      details: {
        assetId: asset.id,
        identifierId: identifier.id,
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "other.example.com",
        conflictingAssetId,
      },
    } satisfies Partial<ApplicationError>);
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("rejects identifier conflicts with the owning asset id", async () => {
    const previous = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(previous);
    assetRepository.addIdentifier.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );
    assetRepository.getAssetIDByIdentifier.mockResolvedValue(
      "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    );

    await expect(
      assetService.addIdentifier({
        assetId: previous.id,
        identifier: {
          type: AssetIdentifierType.DnsName,
          value: "api.example.com",
        },
        user,
      }),
    ).rejects.toMatchObject({
      code: "asset.identifier_conflict",
      kind: "conflict",
      details: {
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "api.example.com",
        conflictingAssetId: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
      },
    } satisfies Partial<ApplicationError>);
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("removes identifiers and emits a complete post-commit snapshot", async () => {
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const previous = createAssetFixture({ identifiers: [identifier] });
    const current = createAssetFixture({
      updatedAt: new Date("2026-02-03T04:05:06.000Z"),
      updatedBy: user.id,
    });
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    assetRepository.deleteIdentifierByID.mockResolvedValue(
      identifierMutation(identifier, previous, current),
    );

    await expect(
      assetService.deleteIdentifierByID({
        assetId: previous.id,
        identifierId: identifier.id,
        user,
        eventContext,
      }),
    ).resolves.toEqual(identifier);
    expect(assetRepository.deleteIdentifierByID).toHaveBeenCalledWith(
      previous.id,
      identifier.id,
      expect.objectContaining({ updatedBy: user.id }),
    );
    expect(domainEvents.eventsFor("asset.updated")[0]).toMatchObject({
      data: {
        previous: { ...previous, customFields: [] },
        current: { ...current, customFields: [] },
      },
    });
  });

  it("deletes unreferenced assets and emits the complete deleted snapshot", async () => {
    const asset = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);
    assetRepository.deleteByID.mockResolvedValue({ previous: withCustomFields(asset) });

    await expect(assetService.deleteByID(asset.id, eventContext)).resolves.toEqual(asset);
    expect(domainEvents.eventsFor("asset.deleted")[0]).toMatchObject({
      actor: user.id,
      data: { asset: { ...asset, customFields: [] } },
    });
  });

  it("rejects deleting an asset linked to findings", async () => {
    const asset = createAssetFixture();
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);
    assetRepository.countFindingsByAssetID.mockResolvedValue(1);

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.deleteByID).not.toHaveBeenCalled();
  });

  it("maps a deletion race with a foreign key conflict to a reference conflict", async () => {
    const asset = createAssetFixture();
    const foreignKeyError = Object.assign(new Error("violates foreign key constraint"), {
      code: "23503",
    });
    const assetService = createTestAssetService();
    assetRepository.getByID.mockResolvedValue(asset);
    assetRepository.countFindingsByAssetID.mockResolvedValue(0);
    assetRepository.deleteByID.mockRejectedValue(foreignKeyError);

    await expect(assetService.deleteByID(asset.id)).rejects.toMatchObject({
      code: "asset.delete_referenced_by_findings",
      kind: "conflict",
      details: { assetId: asset.id },
    } satisfies Partial<ApplicationError>);
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id);
    expect(domainEvents.subjects()).toEqual([]);
  });
});
