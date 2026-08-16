import type { AssetService } from "../service/asset.js";
import type { Asset, AssetType } from "@exposurenexus/types/model/asset";
import type { Logger } from "pino";

type AssetLookupService = Pick<AssetService, "listByDisplayName">;

export interface ResolveAssetOptions {
  type: AssetType;
  displayName: string;
}

interface AssetImportDependencies {
  assetService: AssetLookupService;
  logger: Logger;
}

export function createResolveAsset({ assetService, logger }: AssetImportDependencies) {
  return async function resolveAsset({
    type,
    displayName,
  }: ResolveAssetOptions): Promise<Asset | null> {
    const matches = await assetService.listByDisplayName(displayName, type);
    if (matches.length === 1) {
      return matches[0]!;
    }

    logger.warn(
      { assetDisplayName: displayName, assetType: type, matchCount: matches.length },
      "could not resolve managed asset for finding import",
    );
    return null;
  };
}
