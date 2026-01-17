import {
  type Finding,
  FindingSeverity,
  FindingStatus
} from "@openvlp/types/model/finding"
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

export async function create(finding: Omit<Finding, "id">): Promise<Finding> {
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

type FindingCountByField = "severity" | "status" | "assetId" | "source"

export async function countBy(
  field: FindingCountByField
): Promise<Record<string, number>> {
  const result = await db
    .selectFrom("finding")
    .select([`${field} as field`, db.fn.countAll().as("count")])
    .groupBy(field)
    .execute()

  return result.reduce(
    (acc, r) => ({ ...acc, [r.field || "null"]: Number(r.count) }),
    {}
  )
}
