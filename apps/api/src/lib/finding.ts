import type { Finding } from "@openvlp/types/model/finding"
import { db } from "../db/index.js"

export async function listFindings(): Promise<Finding[]> {
  const data = await db.selectFrom("finding").selectAll().execute()
  return Promise.resolve(data)
}

export async function getFindingByID(id: string): Promise<Finding | null> {
  const finding = await db
    .selectFrom("finding")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst()

  return finding || null
}

export async function createFinding(
  finding: Omit<Finding, "id">
): Promise<Finding> {
  const createdFinding = await db
    .insertInto("finding")
    .values({
      ...finding
    })
    .returningAll()
    .executeTakeFirst()

  return createdFinding!
}

export async function deleteFinding(id: string): Promise<Finding | null> {
  const deletedFinding = await db
    .deleteFrom("finding")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst()

  return deletedFinding || null
}
