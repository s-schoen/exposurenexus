import { type FindingInternal } from "@openvlp/types/model/finding"
import { db } from "../db/index.js"

export async function list(): Promise<FindingInternal[]> {
  return await db.selectFrom("finding").selectAll().execute()
}

export async function getByID(id: string): Promise<FindingInternal | null> {
  const finding = await db
    .selectFrom("finding")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst()

  return finding || null
}

export async function getByFingerprint(
  hash: string
): Promise<FindingInternal | null> {
  const finding = await db
    .selectFrom("finding")
    .selectAll()
    .where("fingerprint", "=", hash)
    .executeTakeFirst()

  return finding || null
}

export async function create(
  finding: Omit<FindingInternal, "id">
): Promise<FindingInternal> {
  const createdFinding = await db
    .insertInto("finding")
    .values({
      ...finding
    })
    .returningAll()
    .executeTakeFirst()

  return createdFinding!
}

export async function update(
  id: string,
  updatedFinding: Omit<FindingInternal, "id">
): Promise<FindingInternal> {
  const createdFinding = await db
    .updateTable("finding")
    .set(updatedFinding)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst()

  return createdFinding!
}

export async function deleteByID(id: string): Promise<FindingInternal | null> {
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
