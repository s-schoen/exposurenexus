import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createResolveAsset } from "./util.js";

import type { Logger } from "pino";

describe("import util", () => {
  const logger = { warn: vi.fn() } as unknown as Logger;
  const user = createTestUser();
  const assetService = {
    listByDisplayName: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the asset when exactly one asset matches", async () => {
    const resolveAsset = createResolveAsset({ assetService, logger });
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: user.id,
      updatedBy: user.id,
    };

    assetService.listByDisplayName.mockResolvedValue([asset]);

    await expect(
      resolveAsset({ type: AssetType.Host, displayName: asset.displayName }),
    ).resolves.toEqual(asset);
    expect(assetService.listByDisplayName).toHaveBeenCalledWith(asset.displayName, AssetType.Host);
    expect(assetService.create).not.toHaveBeenCalled();
  });

  it("returns no asset and logs when no asset matches", async () => {
    const resolveAsset = createResolveAsset({ assetService, logger });
    const displayName = "api.exposurenexus.local";

    assetService.listByDisplayName.mockResolvedValue([]);

    await expect(resolveAsset({ type: AssetType.Host, displayName })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        assetDisplayName: displayName,
        assetType: AssetType.Host,
        matchCount: 0,
      },
      "could not resolve managed asset for finding import",
    );
    expect(assetService.create).not.toHaveBeenCalled();
  });

  it("returns no asset and logs when multiple assets match", async () => {
    const resolveAsset = createResolveAsset({ assetService, logger });
    const displayName = "api.exposurenexus.local";

    assetService.listByDisplayName.mockResolvedValue([
      { id: "76b1885f-2d28-4b7d-93da-2751ff385aa3" },
      { id: "95d5909c-a9ab-4350-a515-4b89eb1065ae" },
    ]);

    await expect(resolveAsset({ type: AssetType.Host, displayName })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        assetDisplayName: displayName,
        assetType: AssetType.Host,
        matchCount: 2,
      },
      "could not resolve managed asset for finding import",
    );
    expect(assetService.create).not.toHaveBeenCalled();
  });
});
