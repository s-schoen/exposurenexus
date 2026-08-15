import type { DomainEventContext } from "../lib/eventbus/events/index.js";
import type { AssetService } from "../service/asset.js";
import type { Asset, AssetType } from "@exposurenexus/types/model/asset";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { Logger } from "pino";

type AssetLookupService = Pick<AssetService, "getByDisplayName" | "create">;

export interface GetOrCreateAssetOptions {
  type: AssetType;
  displayName: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

interface AssetImportDependencies {
  assetService: AssetLookupService;
  logger: Logger;
}

export function createGetOrCreateAsset({ assetService, logger }: AssetImportDependencies) {
  return async function getOrCreateAsset({
    type,
    displayName,
    user,
    eventContext,
  }: GetOrCreateAssetOptions): Promise<Asset> {
    const asset = await assetService.getByDisplayName(displayName, type);
    if (asset) {
      return asset;
    }

    logger.info(
      { assetDisplayName: displayName, assetType: type },
      "creating new asset based on finding import",
    );
    return assetService.create({
      asset: { displayName, type },
      user,
      eventContext,
    });
  };
}
