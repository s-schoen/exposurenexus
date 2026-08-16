import {
  findingAffectedResourceSchema,
  type FindingAffectedResource,
} from "@exposurenexus/types/model/affected-resource";
import { findingPersistenceSchema } from "@exposurenexus/types/model/finding";
import { findingWeaknessSchema, type Weakness } from "@exposurenexus/types/model/weakness";

import type { Database } from "../db/index.js";
import type { FindingTable } from "../db/schema/finding.js";
import type { Kysely, Insertable, Selectable, Updateable } from "kysely";

export type FindingRecord = Selectable<FindingTable>;
export type CreateFindingRecord = Omit<
  Insertable<FindingTable>,
  "weakness" | "affectedResource"
> & {
  weakness: unknown;
  affectedResource: unknown;
};
export type UpdateFindingRecord = Omit<
  Updateable<FindingTable>,
  "weakness" | "affectedResource"
> & {
  weakness?: unknown;
  affectedResource?: unknown;
};
export type FindingCountField = "severity" | "status" | "assetId";

export interface FindingPersistenceRepository {
  list(): Promise<FindingRecord[]>;
  getByID(id: string): Promise<FindingRecord | null>;
  create(finding: CreateFindingRecord): Promise<FindingRecord>;
  updateByID(id: string, finding: UpdateFindingRecord): Promise<FindingRecord | null>;
  deleteByID(id: string): Promise<FindingRecord | null>;
  countBy(field: FindingCountField): Promise<Record<string, number>>;
}

function normalizeFinding(finding: FindingRecord): FindingRecord {
  return findingPersistenceSchema.parse(finding) as FindingRecord;
}

function normalizeFindingInput<T extends { weakness?: unknown; affectedResource?: unknown }>(
  finding: T,
): T {
  return {
    ...finding,
    ...(finding.weakness === undefined
      ? {}
      : { weakness: findingWeaknessSchema.parse(finding.weakness) as Weakness }),
    ...(finding.affectedResource === undefined
      ? {}
      : {
          affectedResource: findingAffectedResourceSchema.parse(
            finding.affectedResource,
          ) as FindingAffectedResource,
        }),
  };
}

export function createFindingPersistenceRepository(
  database: Kysely<Database>,
): FindingPersistenceRepository {
  return {
    async list(): Promise<FindingRecord[]> {
      const findings = await database.selectFrom("finding").selectAll().execute();
      return findings.map(normalizeFinding);
    },

    async getByID(id: string): Promise<FindingRecord | null> {
      const finding = await database
        .selectFrom("finding")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return finding ? normalizeFinding(finding) : null;
    },

    async create(finding: CreateFindingRecord): Promise<FindingRecord> {
      const created = await database
        .insertInto("finding")
        .values(normalizeFindingInput(finding) as Insertable<FindingTable>)
        .returningAll()
        .executeTakeFirstOrThrow();

      return normalizeFinding(created);
    },

    async updateByID(id: string, finding: UpdateFindingRecord): Promise<FindingRecord | null> {
      const updated = await database
        .updateTable("finding")
        .set(normalizeFindingInput(finding) as Updateable<FindingTable>)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return updated ? normalizeFinding(updated) : null;
    },

    async deleteByID(id: string): Promise<FindingRecord | null> {
      const deleted = await database
        .deleteFrom("finding")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return deleted ? normalizeFinding(deleted) : null;
    },

    async countBy(field: FindingCountField): Promise<Record<string, number>> {
      const result = await database
        .selectFrom("finding")
        .select([`${field} as field`, database.fn.countAll().as("count")])
        .groupBy(field)
        .execute();

      return result.reduce<Record<string, number>>((counts, row) => {
        counts[String(row.field)] = Number(row.count);
        return counts;
      }, {});
    },
  };
}
