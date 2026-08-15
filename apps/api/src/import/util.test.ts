import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createGetOrCreateAsset } from "./util.js";

describe("import util", () => {
  const logger = pino({ enabled: false });
  const user = createTestUser();
  const assetService = {
    getByDisplayName: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing asset when one matches", async () => {
    const getOrCreateAsset = createGetOrCreateAsset({ assetService, logger });
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: user.id,
      updatedBy: user.id,
    };

    assetService.getByDisplayName.mockResolvedValue(asset);

    await expect(
      getOrCreateAsset({ type: AssetType.Host, displayName: asset.displayName, user }),
    ).resolves.toEqual(asset);
    expect(assetService.getByDisplayName).toHaveBeenCalledWith(asset.displayName, AssetType.Host);
    expect(assetService.create).not.toHaveBeenCalled();
  });

  it("creates an asset when no match exists", async () => {
    const getOrCreateAsset = createGetOrCreateAsset({ assetService, logger });
    const eventContext = {
      actor: "95d5909c-a9ab-4350-a515-4b89eb1065ae",
      correlationId: "import-request",
    };
    const createdAsset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: user.id,
      updatedBy: user.id,
    };

    assetService.getByDisplayName.mockResolvedValue(null);
    assetService.create.mockResolvedValue(createdAsset);

    await expect(
      getOrCreateAsset({
        type: AssetType.Host,
        displayName: createdAsset.displayName,
        user,
        eventContext,
      }),
    ).resolves.toEqual(createdAsset);
    expect(assetService.create).toHaveBeenCalledWith({
      asset: {
        displayName: createdAsset.displayName,
        type: AssetType.Host,
      },
      user,
      eventContext,
    });
  });
});
