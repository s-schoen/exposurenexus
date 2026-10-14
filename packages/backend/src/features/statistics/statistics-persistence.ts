import type { DatabaseExecutor } from "../../database/executor.js";
import type { FindingStatus } from "@exposurenexus/contracts/model/finding";

export type FindingCountField = "severity" | "status" | "assetId";

/** Counts findings per value of `field`, only those in `statuses` when given. */
export async function countFindingsBy(
  database: DatabaseExecutor,
  field: FindingCountField,
  statuses?: Array<FindingStatus>,
): Promise<Record<string, number>> {
  let query = database
    .selectFrom("finding")
    .select([`${field} as field`, database.fn.countAll().as("count")])
    .groupBy(field);

  if (statuses) {
    query = query.where("status", "in", statuses);
  }

  const result = await query.execute();

  return result.reduce<Record<string, number>>((counts, row) => {
    counts[String(row.field)] = Number(row.count);
    return counts;
  }, {});
}
