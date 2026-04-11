import * as assetRepository from "../repository/asset.js"
import {
  type Asset,
  AssetType,
  type CreateAsset
} from "@openvlp/types/model/asset"
import { createLogger } from "../logging.js"
import { HTTPException } from "hono/http-exception"
import type { Logger } from "pino"

interface AssetRepository {
  list(): Promise<Asset[]>
  getByID(id: string): Promise<Asset | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: Asset): Promise<Asset>
  deleteByID(id: string): Promise<Asset | null>
}

interface AssetServiceDependencies {
  assetRepository: AssetRepository
  logger: Logger
}

export function createAssetService({
  assetRepository,
  logger
}: AssetServiceDependencies) {
  return {
    async listAll(): Promise<Asset[]> {
      try {
        return await assetRepository.list()
      } catch (error) {
        logger.error(error, "failed to list assets")
        throw new HTTPException(500, {
          message: "failed to list assets"
        })
      }
    },

    async getByID(id: string): Promise<Asset | null> {
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
    },

    async getByName(name: string, type?: AssetType): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByName(name, type)
        if (!asset) {
          logger.debug(`asset with name='${name}' and type=${type} not found`)
        }
        return asset
      } catch (error) {
        logger.error(
          error,
          `failed to get asset with name='${name}' and type=${type}`
        )
        throw new HTTPException(500, {
          message: "failed to get asset"
        })
      }
    },

    async create(asset: CreateAsset): Promise<Asset> {
      try {
        const created = await assetRepository.create({
          id: "",
          ...asset
        })

        logger.info(`created asset ${created.id}: ${created.name}`)
        return created
      } catch (error) {
        logger.error(error, `failed to create new asset ${asset.name}`)
        throw new HTTPException(500, {
          message: "failed to create asset"
        })
      }
    },

    async deleteByID(id: string): Promise<Asset | null> {
      try {
        const asset = await assetRepository.deleteByID(id)
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
  }
}

const service = createAssetService({
  assetRepository,
  logger: createLogger("service/asset")
})

export const listAll = service.listAll
export const getByID = service.getByID
export const getByName = service.getByName
export const create = service.create
export const deleteByID = service.deleteByID
