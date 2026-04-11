import { type FindingInternal } from "@openvlp/types/model/finding"
import { db, type Database } from "../db/index.js"
import type { Kysely } from "kysely"

type FindingCountByField = "severity" | "status" | "assetId" | "source"

export function createFindingRepository(database: Kysely<Database>) {
  return {
    async list(): Promise<FindingInternal[]> {
      return await database.selectFrom("finding").selectAll().execute()
    },

    async getByID(id: string): Promise<FindingInternal | null> {
      const finding = await database
        .selectFrom("finding")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst()

      return finding || null
    },

    async getByFingerprint(hash: string): Promise<FindingInternal | null> {
      const finding = await database
        .selectFrom("finding")
        .selectAll()
        .where("fingerprint", "=", hash)
        .executeTakeFirst()

      return finding || null
    },

    async create(
      finding: Omit<FindingInternal, "id">
    ): Promise<FindingInternal> {
      const createdFinding = await database
        .insertInto("finding")
        .values({
          ...finding
        })
        .returningAll()
        .executeTakeFirst()

      return createdFinding!
    },

    async update(
      id: string,
      updatedFinding: Omit<FindingInternal, "id">
    ): Promise<FindingInternal> {
      const createdFinding = await database
        .updateTable("finding")
        .set(updatedFinding)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return createdFinding!
    },

    async deleteByID(id: string): Promise<FindingInternal | null> {
      const deletedFinding = await database
        .deleteFrom("finding")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst()

      return deletedFinding || null
    },

    async countBy(field: FindingCountByField): Promise<Record<string, number>> {
      const result = await database
        .selectFrom("finding")
        .select([`${field} as field`, database.fn.countAll().as("count")])
        .groupBy(field)
        .execute()

      return result.reduce(
        (acc, r) => ({ ...acc, [r.field || "null"]: Number(r.count) }),
        {}
      )
    }
  }
}

const repository = createFindingRepository(db)

export const list = repository.list
export const getByID = repository.getByID
export const getByFingerprint = repository.getByFingerprint
export const create = repository.create
export const update = repository.update
export const deleteByID = repository.deleteByID
export const countBy = repository.countBy
