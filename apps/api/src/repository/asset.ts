import { type Asset, AssetType } from "@openvlp/types/model/asset"
import { db, type Database } from "../db/index.js"
import type { Kysely } from "kysely"

export function createAssetRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<Asset[]> {
      const data = await database.selectFrom("asset").selectAll().execute()
      return Promise.resolve(data)
    },

    async getByID(id: string): Promise<Asset | null> {
      const assets = await database
        .selectFrom("asset")
        .selectAll()
        .where("id", "=", id)
        .execute()

      if (assets.length === 0) {
        return null
      }
      return assets[0]
    },

    async getByName(name: string, type?: AssetType): Promise<Asset | null> {
      let query = database
        .selectFrom("asset")
        .selectAll()
        .where("name", "=", name)
      if (type) {
        query = query.where("type", "=", type)
      }

      const asset = await query.executeTakeFirst()
      return asset || null
    },

    async create(asset: Asset): Promise<Asset> {
      const createdAsset = await database
        .insertInto("asset")
        .values({
          name: asset.name,
          type: asset.type
        })
        .returningAll()
        .executeTakeFirst()

      return createdAsset!
    },

    async deleteByID(id: string): Promise<Asset | null> {
      const deletedAsset = await database
        .deleteFrom("asset")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      if (!deletedAsset) {
        return null
      }
      return deletedAsset
    }
  }
}

const repository = createAssetRepository(db)

export const list = repository.list
export const getByID = repository.getByID
export const getByName = repository.getByName
export const create = repository.create
export const deleteByID = repository.deleteByID
