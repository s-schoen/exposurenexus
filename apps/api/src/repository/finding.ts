import type { Finding } from "@openvlp/types/model/finding"
import { db } from "../db/index.js"

export async function list(): Promise<Finding[]> {
  return await db.selectFrom("finding").selectAll().execute()
}

export async function getByID(id: string): Promise<Finding | null> {
  const finding = await db
    .selectFrom("finding")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst()

  return finding || null
}

export async function create(finding: Finding): Promise<Finding> {
  const createdFinding = await db
    .insertInto("finding")
    .values({
      ...finding
    })
    .returningAll()
    .executeTakeFirst()

  return createdFinding!
}

export async function deleteByID(id: string): Promise<Finding | null> {
  const deletedFinding = await db
    .deleteFrom("finding")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst()

  return deletedFinding || null
}
