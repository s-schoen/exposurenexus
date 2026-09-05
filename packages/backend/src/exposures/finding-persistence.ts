import { findingAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { findingRecordSchema } from "@exposurenexus/contracts/model/finding";
import { weaknessSchema } from "@exposurenexus/contracts/model/weakness";

import type { DatabaseExecutor } from "../database/executor.js";
import type { FindingTable } from "../database/schema/finding.js";
import type { Insertable, Selectable, Updateable } from "kysely";

export type FindingRecord = Selectable<FindingTable>;
export type CreateFindingRecord = Insertable<FindingTable>;
export type UpdateFindingRecord = Updateable<FindingTable>;

function normalizeFinding(finding: FindingRecord): FindingRecord {
  return findingRecordSchema.parse(finding) as FindingRecord;
}

function normalizedFindingValues(finding: CreateFindingRecord): CreateFindingRecord {
  return {
    ...finding,
    weakness: weaknessSchema.parse(finding.weakness),
    affectedResource: findingAffectedResourceSchema.parse(finding.affectedResource),
  };
}

function normalizedFindingUpdate(finding: UpdateFindingRecord): UpdateFindingRecord {
  return {
    ...finding,
    ...(finding.weakness === undefined ? {} : { weakness: weaknessSchema.parse(finding.weakness) }),
    ...(finding.affectedResource === undefined
      ? {}
      : { affectedResource: findingAffectedResourceSchema.parse(finding.affectedResource) }),
  };
}

export async function lockFinding(
  database: DatabaseExecutor,
  id: string,
): Promise<FindingRecord | null> {
  const finding = await database
    .selectFrom("finding")
    .selectAll()
    .where("id", "=", id)
    .forUpdate()
    .executeTakeFirst();

  return finding ? normalizeFinding(finding) : null;
}

export async function insertFinding(
  database: DatabaseExecutor,
  finding: CreateFindingRecord,
): Promise<FindingRecord> {
  const created = await database
    .insertInto("finding")
    .values(normalizedFindingValues(finding))
    .returningAll()
    .executeTakeFirstOrThrow();

  return normalizeFinding(created);
}

export async function updateFinding(
  database: DatabaseExecutor,
  id: string,
  finding: UpdateFindingRecord,
): Promise<FindingRecord | null> {
  const updated = await database
    .updateTable("finding")
    .set(normalizedFindingUpdate(finding))
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  return updated ? normalizeFinding(updated) : null;
}

export async function deleteFinding(
  database: DatabaseExecutor,
  id: string,
): Promise<FindingRecord | null> {
  const deleted = await database
    .deleteFrom("finding")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  return deleted ? normalizeFinding(deleted) : null;
}
