import * as assetService from "../service/asset.js"
import * as vulnerabilityService from "../service/vulnerability.js"
import type { Asset, AssetType } from "@openvlp/types/model/asset"
import { createLogger } from "../logging.js"
import type { Vulnerability } from "@openvlp/types/model/vulnerability"
import type { FindingSource } from "@openvlp/types/model/finding"

const logger = createLogger("findings/import")

export async function getOrCreateAsset(
  type: AssetType,
  name: string
): Promise<Asset> {
  const asset = await assetService.getByName(name, type)
  if (asset) {
    return asset
  }

  // does not exist, create it
  logger.info(`creating new asset ${name} based on finding import`)
  return assetService.create({ name, type })
}
