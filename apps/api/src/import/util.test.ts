import { AssetType } from "@exposurenexus/types/model/asset";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGetOrCreateAsset } from "./util.js";

describe("import util", () => {
  const logger = pino({ enabled: false });
  const assetService = {
    getByName: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing asset when one matches", async () => {
    const getOrCreateAsset = createGetOrCreateAsset({ assetService, logger });
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };

    assetService.getByName.mockResolvedValue(asset);

    await expect(getOrCreateAsset(AssetType.Host, asset.name)).resolves.toEqual(asset);
    expect(assetService.getByName).toHaveBeenCalledWith(asset.name, AssetType.Host);
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
      name: "api.exposurenexus.local",
      type: AssetType.Host,
      ownerId: null,
    };

    assetService.getByName.mockResolvedValue(null);
    assetService.create.mockResolvedValue(createdAsset);

    await expect(
      getOrCreateAsset(AssetType.Host, createdAsset.name, eventContext),
    ).resolves.toEqual(createdAsset);
    expect(assetService.create).toHaveBeenCalledWith(
      {
        name: createdAsset.name,
        type: AssetType.Host,
      },
      eventContext,
    );
  });
});
