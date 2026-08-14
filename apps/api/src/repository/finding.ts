import { type FindingInternal } from "@exposurenexus/types/model/finding";

import type { Database } from "../db/index.js";
import type { Kysely } from "kysely";

export type FindingCountByField = "severity" | "status" | "assetId" | "source";

export interface ReclassifyFindingsQuery {
  source: string;
  oldVulnerabilityId: string;
  targetVulnerabilityId: string;
  severity: FindingInternal["severity"];
  updatedAt: Date;
  updatedBy: string;
}

export interface FindingRepository {
  list(): Promise<FindingInternal[]>;
  getByID(id: string): Promise<FindingInternal | null>;
  getByFingerprint(hash: string): Promise<FindingInternal | null>;
  create(finding: Omit<FindingInternal, "id">): Promise<FindingInternal>;
  updateByID(id: string, updatedFinding: Omit<FindingInternal, "id">): Promise<FindingInternal>;
  deleteByID(id: string): Promise<FindingInternal | null>;
  reclassifyBySourceAndVulnerability(query: ReclassifyFindingsQuery): Promise<FindingInternal[]>;
  countBy(field: FindingCountByField): Promise<Record<string, number>>;
}

export function createFindingRepository(database: Kysely<Database>): FindingRepository {
  return {
    async list(): Promise<FindingInternal[]> {
      return await database.selectFrom("finding").selectAll().execute();
    },

    async getByID(id: string): Promise<FindingInternal | null> {
      const finding = await database
        .selectFrom("finding")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return finding || null;
    },

    async getByFingerprint(hash: string): Promise<FindingInternal | null> {
      const finding = await database
        .selectFrom("finding")
        .selectAll()
        .where("fingerprint", "=", hash)
        .executeTakeFirst();

      return finding || null;
    },

    async create(finding: Omit<FindingInternal, "id">): Promise<FindingInternal> {
      const createdFinding = await database
        .insertInto("finding")
        .values({
          ...finding,
        })
        .returningAll()
        .executeTakeFirst();

      return createdFinding!;
    },

    async updateByID(
      id: string,
      updatedFinding: Omit<FindingInternal, "id">,
    ): Promise<FindingInternal> {
      const createdFinding = await database
        .updateTable("finding")
        .set(updatedFinding)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return createdFinding!;
    },

    async deleteByID(id: string): Promise<FindingInternal | null> {
      const deletedFinding = await database
        .deleteFrom("finding")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return deletedFinding || null;
    },

    async reclassifyBySourceAndVulnerability({
      source,
      oldVulnerabilityId,
      targetVulnerabilityId,
      severity,
      updatedAt,
      updatedBy,
    }: ReclassifyFindingsQuery): Promise<FindingInternal[]> {
      return await database
        .updateTable("finding")
        .set({
          vulnerabilityId: targetVulnerabilityId,
          severity,
          updatedAt,
          updatedBy,
        })
        .where("source", "=", source)
        .where("vulnerabilityId", "=", oldVulnerabilityId)
        .returningAll()
        .execute();
    },

    async countBy(field: FindingCountByField): Promise<Record<string, number>> {
      const result = await database
        .selectFrom("finding")
        .select([`${field} as field`, database.fn.countAll().as("count")])
        .groupBy(field)
        .execute();

      return result.reduce((acc, r) => ({ ...acc, [r.field || "null"]: Number(r.count) }), {});
    },
  };
}
