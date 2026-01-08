import * as assetRepository from "../repository/asset.js"
import type { Asset, CreateAsset } from "@openvlp/types/model/asset"
import { createLogger } from "../logging.js"
import { HTTPException } from "hono/http-exception"

const logger = createLogger("service/asset")

export async function listAll(): Promise<Asset[]> {
  try {
    return assetRepository.list()
  } catch (error) {
    logger.error(error, "failed to list assets")
    throw new HTTPException(500, {
      message: "failed to list assets"
    })
  }
}

export async function getByID(id: string): Promise<Asset | null> {
  try {
    const asset = await assetRepository.getByID(id)
    if (!asset) {
      logger.debug(`asset with id ${id} not found`)
    }
    return asset
  } catch (error) {
    logger.error(error, `failed to get asset with id ${id}`)
    throw new HTTPException(500, {
      message: "failed to get asset"
    })
  }
}

export async function create(asset: CreateAsset): Promise<Asset> {
  try {
    return assetRepository.create({
      id: "",
      ...asset
    })
  } catch (error) {
    logger.error(error, `failed to create new asset ${asset.name}`)
    throw new HTTPException(500, {
      message: "failed to create asset"
    })
  }
}

export async function deleteByID(id: string): Promise<Asset | null> {
  try {
    const asset = assetRepository.deleteByID(id)
    if (!asset) {
      logger.debug(`cannot delete asset ${id}: not found`)
    }
    return asset
  } catch (error) {
    logger.error(error, `failed to get asset with id ${id}`)
    throw new HTTPException(500, {
      message: "failed to get asset"
    })
  }
}
