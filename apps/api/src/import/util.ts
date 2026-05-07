import type {
  Asset,
  AssetType,
  CreateAsset
} from "@exposurenexus/types/model/asset"
import type { Logger } from "pino"
import type { DomainEventContext } from "../lib/eventbus/events/index.js"

interface AssetLookupService {
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(options: {
    asset: CreateAsset
    eventContext?: DomainEventContext
  }): Promise<Asset>
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
    name: string,
    eventContext?: DomainEventContext
  ): Promise<Asset> {
    const asset = await assetService.getByName(name, type)
    if (asset) {
      return asset
    }

    logger.info(`creating new asset ${name} based on finding import`)
    return assetService.create({
      asset: { name, type },
      eventContext
    })
  }
}
