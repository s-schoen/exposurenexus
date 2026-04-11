import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { AssetType } from "@openvlp/types/model/asset"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../repository/asset.js", () => ({
  list: vi.fn(),
  getByID: vi.fn(),
  getByName: vi.fn(),
  create: vi.fn(),
  deleteByID: vi.fn()
}))

import * as assetRepository from "../repository/asset.js"
import * as assetService from "./asset.js"

describe("asset service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists all assets from the repository", async () => {
    const assets = [
      {
        id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
        name: "api.openvlp.local",
        type: AssetType.Host
      }
    ]

    vi.mocked(assetRepository.list).mockResolvedValue(assets)

    await expect(assetService.listAll()).resolves.toEqual(assets)
    expect(assetRepository.list).toHaveBeenCalledOnce()
  })

  it("maps repository list failures to an HTTP 500", async () => {
    vi.mocked(assetRepository.list).mockRejectedValue(new Error("db offline"))

    await expect(assetService.listAll()).rejects.toMatchObject({
      status: 500,
      message: "failed to list assets"
    } satisfies Partial<HTTPException>)
  })

  it("returns an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    vi.mocked(assetRepository.getByID).mockResolvedValue(asset)

    await expect(assetService.getByID(asset.id)).resolves.toEqual(asset)
    expect(assetRepository.getByID).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when an asset does not exist", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    vi.mocked(assetRepository.getByID).mockResolvedValue(null)

    await expect(assetService.getByID(assetId)).resolves.toBeNull()
  })

  it("passes the lookup name and type to the repository", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    vi.mocked(assetRepository.getByName).mockResolvedValue(asset)

    await expect(
      assetService.getByName(asset.name, asset.type)
    ).resolves.toEqual(asset)
    expect(assetRepository.getByName).toHaveBeenCalledWith(
      asset.name,
      asset.type
    )
  })

  it("creates assets with a generated repository id", async () => {
    const payload = {
      name: "worker.openvlp.local",
      type: AssetType.Host
    }
    const createdAsset = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      ...payload
    }

    vi.mocked(assetRepository.create).mockResolvedValue(createdAsset)

    await expect(assetService.create(payload)).resolves.toEqual(createdAsset)
    expect(assetRepository.create).toHaveBeenCalledWith({
      id: "",
      ...payload
    })
  })

  it("maps repository create failures to an HTTP 500", async () => {
    vi.mocked(assetRepository.create).mockRejectedValue(
      new Error("insert failed")
    )

    await expect(
      assetService.create({
        name: "worker.openvlp.local",
        type: AssetType.Host
      })
    ).rejects.toMatchObject({
      status: 500,
      message: "failed to create asset"
    } satisfies Partial<HTTPException>)
  })

  it("deletes an asset by id", async () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      name: "api.openvlp.local",
      type: AssetType.Host
    }

    vi.mocked(assetRepository.deleteByID).mockResolvedValue(asset)

    await expect(assetService.deleteByID(asset.id)).resolves.toEqual(asset)
    expect(assetRepository.deleteByID).toHaveBeenCalledWith(asset.id)
  })

  it("returns null when deleting a missing asset", async () => {
    const assetId = "76b1885f-2d28-4b7d-93da-2751ff385aa3"

    vi.mocked(assetRepository.deleteByID).mockResolvedValue(null)

    await expect(assetService.deleteByID(assetId)).resolves.toBeNull()
  })
})
