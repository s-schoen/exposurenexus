import { type Asset, AssetType } from "@exposurenexus/types/model/asset"
import { type Database } from "../db/index.js"
import { type Kysely } from "kysely"

export type CreateAssetRecord = Omit<Asset, "ownerId"> & {
  ownerId?: Asset["ownerId"]
}

export interface AssetRepository {
  list(): Promise<Asset[]>
  getByID(id: string): Promise<Asset | null>
  getByName(name: string, type?: AssetType): Promise<Asset | null>
  create(asset: CreateAssetRecord): Promise<Asset>
  updateOwnerByID(id: string, ownerId: Asset["ownerId"]): Promise<Asset | null>
  deleteByID(id: string): Promise<Asset | null>
  countFindingsByAssetID(id: string): Promise<number>
}

export function createAssetRepository(
  database: Kysely<Database>
): AssetRepository {
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

    async create(asset: CreateAssetRecord): Promise<Asset> {
      const createdAsset = await database
        .insertInto("asset")
        .values({
          name: asset.name,
          type: asset.type,
          ownerId: asset.ownerId ?? null
        })
        .returningAll()
        .executeTakeFirst()

      return createdAsset!
    },

    async updateOwnerByID(
      id: string,
      ownerId: Asset["ownerId"]
    ): Promise<Asset | null> {
      const updatedAsset = await database
        .updateTable("asset")
        .set({
          ownerId
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return updatedAsset ?? null
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
    },

    async countFindingsByAssetID(id: string): Promise<number> {
      const result = await database
        .selectFrom("finding")
        .select(database.fn.countAll().as("count"))
        .where("assetId", "=", id)
        .executeTakeFirst()

      return Number(result?.count ?? 0)
    }
  }
}
