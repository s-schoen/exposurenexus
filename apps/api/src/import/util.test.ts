import { beforeEach, describe, expect, it, vi } from "vitest"
import { AssetType } from "@openvlp/types/model/asset"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../service/asset.js", () => ({
  getByName: vi.fn(),
  create: vi.fn()
}))

import * as assetService from "../service/asset.js"
import { getOrCreateAsset } from "./util.js"

describe("import util", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an existing asset when one matches", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    vi.mocked(assetService.getByName).mockResolvedValue(asset)

    await expect(getOrCreateAsset(AssetType.Host, asset.name)).resolves.toEqual(
      asset
    )
    expect(assetService.getByName).toHaveBeenCalledWith(
      asset.name,
      AssetType.Host
    )
    expect(assetService.create).not.toHaveBeenCalled()
  })

  it("creates an asset when no match exists", async () => {
    const createdAsset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    vi.mocked(assetService.getByName).mockResolvedValue(null)
    vi.mocked(assetService.create).mockResolvedValue(createdAsset)

    await expect(
      getOrCreateAsset(AssetType.Host, createdAsset.name)
    ).resolves.toEqual(createdAsset)
    expect(assetService.create).toHaveBeenCalledWith({
      name: createdAsset.name,
      type: AssetType.Host
    })
  })
})
