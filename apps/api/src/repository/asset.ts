import { type Asset, AssetType } from "@openvlp/types/model/asset"
import { db } from "../db/index.js"

export async function list(): Promise<Asset[]> {
  const data = await db.selectFrom("asset").selectAll().execute()
  return Promise.resolve(data)
}

export async function getByID(id: string): Promise<Asset | null> {
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

export async function getByName(
  name: string,
  type?: AssetType
): Promise<Asset | null> {
  let query = db.selectFrom("asset").selectAll().where("name", "=", name)
  if (type) {
    query = query.where("type", "=", type)
  }

  const asset = await query.executeTakeFirst()
  return asset || null
}

export async function create(asset: Asset): Promise<Asset> {
  const createdAsset = await db
    .insertInto("asset")
    .values({
      name: asset.name,
      type: asset.type
    })
    .returningAll()
    .executeTakeFirst()

  return createdAsset!
}

export async function deleteByID(id: string): Promise<Asset | null> {
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
