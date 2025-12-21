import { createLogger } from "../logging.js"
import type { Asset } from "@openvlp/types/model/asset"
import { db } from "../db/index.js"

const logger = createLogger("assets")

export async function listAssets(): Promise<Asset[]> {
  const data = await db.selectFrom("asset").selectAll().execute()
  return Promise.resolve(data)
}

export async function getAsset(id: string): Promise<Asset | null> {
  const assets = await db
    .selectFrom("asset")
    .selectAll()
    .where("id", "=", id)
    .execute()

  if (assets.length === 0) {
    return null
  }
  return assets[0]
}

export async function createAsset(asset: Asset): Promise<Asset> {
  const createdAsset = await db
    .insertInto("asset")
    .values(asset)
    .returningAll()
    .executeTakeFirst()

  return asset
}

export async function deleteAsset(id: string): Promise<Asset | null> {
  const deletedAsset = await db
    .deleteFrom("asset")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst()

  if (!deletedAsset) {
    return null
  }
  return deletedAsset
}
