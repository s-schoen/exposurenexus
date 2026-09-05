import type { DatabaseExecutor } from "../database/executor.js";

export type FindingCountField = "severity" | "status" | "assetId";

export async function countFindingsBy(
  database: DatabaseExecutor,
  field: FindingCountField,
): Promise<Record<string, number>> {
  const result = await database
    .selectFrom("finding")
    .select([`${field} as field`, database.fn.countAll().as("count")])
    .groupBy(field)
    .execute();

  return result.reduce<Record<string, number>>((counts, row) => {
    counts[String(row.field)] = Number(row.count);
    return counts;
  }, {});
}
