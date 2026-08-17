import { type FindingInternal } from "@exposurenexus/types/model/finding";

import type { Database } from "../db/index.js";
import type { Generated, Kysely } from "kysely";

interface LegacyFindingTable {
  id: Generated<string>;
  vulnerabilityId: string;
  severity: FindingInternal["severity"];
  status: FindingInternal["status"];
  source: string;
  evidence: string | null;
  mitigation: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  firstSeen: Date;
  lastSeen: Date;
  fingerprint: string;
  assetId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyDatabase {
  finding: LegacyFindingTable;
}

export type FindingCountByField = "severity" | "status" | "assetId" | "source";

export interface FindingRepository {
  list(): Promise<FindingInternal[]>;
  getByID(id: string): Promise<FindingInternal | null>;
  getByFingerprint(hash: string): Promise<FindingInternal | null>;
  create(finding: Omit<FindingInternal, "id">): Promise<FindingInternal>;
  updateByID(id: string, updatedFinding: Omit<FindingInternal, "id">): Promise<FindingInternal>;
  deleteByID(id: string): Promise<FindingInternal | null>;
  countBy(field: FindingCountByField): Promise<Record<string, number>>;
}

export function createFindingRepository(database: Kysely<Database>): FindingRepository {
  const legacyDatabase = database as unknown as Kysely<LegacyDatabase>;

  return {
    async list(): Promise<FindingInternal[]> {
      return await legacyDatabase.selectFrom("finding").selectAll().execute();
    },

    async getByID(id: string): Promise<FindingInternal | null> {
      const finding = await legacyDatabase
        .selectFrom("finding")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return finding || null;
    },

    async getByFingerprint(hash: string): Promise<FindingInternal | null> {
      const finding = await legacyDatabase
        .selectFrom("finding")
        .selectAll()
        .where("fingerprint", "=", hash)
        .executeTakeFirst();

      return finding || null;
    },

    async create(finding: Omit<FindingInternal, "id">): Promise<FindingInternal> {
      const createdFinding = await legacyDatabase
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
      const createdFinding = await legacyDatabase
        .updateTable("finding")
        .set(updatedFinding)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return createdFinding!;
    },

    async deleteByID(id: string): Promise<FindingInternal | null> {
      const deletedFinding = await legacyDatabase
        .deleteFrom("finding")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return deletedFinding || null;
    },

    async countBy(field: FindingCountByField): Promise<Record<string, number>> {
      const result = await legacyDatabase
        .selectFrom("finding")
        .select([`${field} as field`, legacyDatabase.fn.countAll().as("count")])
        .groupBy(field)
        .execute();

      return result.reduce((acc, r) => ({ ...acc, [r.field || "null"]: Number(r.count) }), {});
    },
  };
}
