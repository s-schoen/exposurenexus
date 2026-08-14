import type { DomainEventContext } from "../lib/eventbus/events/index.js";
import type { AssetService } from "../service/asset.js";
import type { Asset, AssetType, CreateAsset } from "@exposurenexus/types/model/asset";
import type { Logger } from "pino";

type AssetLookupService = Pick<AssetService, "getByName" | "create">;

interface AssetImportDependencies {
  assetService: AssetLookupService;
  logger: Logger;
}

export function createGetOrCreateAsset({ assetService, logger }: AssetImportDependencies) {
  return async function getOrCreateAsset(
    type: AssetType,
    name: string,
    eventContext?: DomainEventContext,
  ): Promise<Asset> {
    const asset = await assetService.getByName(name, type);
    if (asset) {
      return asset;
    }

    logger.info(`creating new asset ${name} based on finding import`);
    return assetService.create({ name, type } satisfies CreateAsset, eventContext);
  };
}
