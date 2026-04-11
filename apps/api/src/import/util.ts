import type { Asset, AssetType, CreateAsset } from "@openvlp/types/model/asset"
import type { Logger } from "pino"

interface AssetLookupService {
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: CreateAsset): Promise<Asset>
}

interface AssetImportDependencies {
  assetService: AssetLookupService
  logger: Logger
}

export function createGetOrCreateAsset({
  assetService,
  logger
}: AssetImportDependencies) {
  return async function getOrCreateAsset(
    type: AssetType,
    name: string
  ): Promise<Asset> {
    const asset = await assetService.getByName(name, type)
    if (asset) {
      return asset
    }

    logger.info(`creating new asset ${name} based on finding import`)
    return assetService.create({ name, type })
  }
}
