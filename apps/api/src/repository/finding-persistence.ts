import {
  findingAffectedResourceSchema,
  type FindingAffectedResource,
  observationAffectedResourceSchema,
} from "@exposurenexus/types/model/affected-resource";
import {
  findingPersistenceSchema,
  findingProjectionSchema,
  type FindingProjection,
} from "@exposurenexus/types/model/finding";
import { observationSchema, type Observation } from "@exposurenexus/types/model/observation";
import { findingWeaknessSchema, type Weakness } from "@exposurenexus/types/model/weakness";
import { observationWeaknessSchema } from "@exposurenexus/types/model/weakness";
import {
  sql,
  type Kysely,
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely";

import type { Database } from "../db/index.js";
import type { FindingTable } from "../db/schema/finding.js";
import type { ObservationTable } from "../db/schema/observation.js";
import type { FindingVulnerabilityRecord } from "./finding-vulnerability.js";
import type { CreateObservationRecord } from "./observation.js";

export type FindingRecord = Selectable<FindingTable>;
type FindingProjectionRow = FindingRecord & {
  vulnerabilities: unknown;
  observationCount: number;
  observingSources: unknown;
  firstSeen: Date | null;
  lastSeen: Date | null;
};
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
export type CreateManualFindingObservation = Omit<CreateObservationRecord, "findingId">;

export interface CreateManualFindingInput {
  finding: CreateFindingRecord;
  observation: CreateManualFindingObservation;
  vulnerabilityIds: readonly string[];
}

export interface CreateManualFindingResult {
  finding: FindingRecord;
  observation: Observation;
  links: FindingVulnerabilityRecord[];
}

export interface FindingPersistenceRepository {
  list(): Promise<FindingRecord[]>;
  getByID(id: string): Promise<FindingRecord | null>;
  listProjected(): Promise<FindingProjection[]>;
  getProjectedByID(id: string): Promise<FindingProjection | null>;
  createManual(input: CreateManualFindingInput): Promise<CreateManualFindingResult>;
  create(finding: CreateFindingRecord): Promise<FindingRecord>;
  updateByID(id: string, finding: UpdateFindingRecord): Promise<FindingRecord | null>;
  deleteByID(id: string): Promise<FindingRecord | null>;
  countBy(field: FindingCountField): Promise<Record<string, number>>;
}

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

function normalizeFinding(finding: FindingRecord): FindingRecord {
  return findingPersistenceSchema.parse(finding) as FindingRecord;
}

function normalizeFindingProjection(finding: FindingProjectionRow): FindingProjection {
  return findingProjectionSchema.parse(finding);
}

const findingProjectionGroupColumns = [
  "finding.id",
  "finding.assetId",
  "finding.title",
  "finding.severity",
  "finding.status",
  "finding.assigneeId",
  "finding.dueDate",
  "finding.mitigation",
  "finding.weakness",
  "finding.affectedResource",
  "finding.createdAt",
  "finding.updatedAt",
  "finding.createdBy",
  "finding.updatedBy",
] as const;

function projectionQuery(database: DatabaseExecutor) {
  return database
    .selectFrom("finding")
    .leftJoin("observation", "observation.findingId", "finding.id")
    .selectAll("finding")
    .select([
      sql<number>`count(distinct ${sql.ref("observation.id")})`.as("observationCount"),
      sql<unknown>`
        coalesce(
          to_jsonb(array_agg(distinct ${sql.ref("observation.source")}::text order by ${sql.ref("observation.source")}::text)
            filter (where ${sql.ref("observation.id")} is not null)),
          '[]'::jsonb
        )
      `.as("observingSources"),
      sql<Date | null>`min(${sql.ref("observation.observedAt")})`.as("firstSeen"),
      sql<Date | null>`max(${sql.ref("observation.observedAt")})`.as("lastSeen"),
      sql<unknown[]>`
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', "projection_vulnerability"."id",
                'type', "projection_vulnerability"."type",
                'identifier', "projection_vulnerability"."identifier",
                'title', "projection_vulnerability"."title",
                'description', "projection_vulnerability"."description",
                'severity', "projection_vulnerability"."severity",
                'metadata', "projection_vulnerability"."metadata",
                'createdAt', "projection_vulnerability"."createdAt",
                'updatedAt', "projection_vulnerability"."updatedAt",
                'createdBy', "projection_vulnerability"."createdBy",
                'updatedBy', "projection_vulnerability"."updatedBy"
              )
              order by "projection_vulnerability"."type", "projection_vulnerability"."identifier"
            )
            from "finding_vulnerability" as "projection_link"
            inner join "vulnerability" as "projection_vulnerability"
              on "projection_vulnerability"."id" = "projection_link"."vulnerabilityId"
            where "projection_link"."findingId" = "finding"."id"
          ),
          '[]'::jsonb
        )
      `.as("vulnerabilities"),
    ])
    .groupBy(findingProjectionGroupColumns)
    .orderBy("finding.updatedAt", "desc");
}

export async function getFindingProjectionByID(
  database: DatabaseExecutor,
  id: string,
): Promise<FindingProjection | null> {
  const finding = await projectionQuery(database).where("finding.id", "=", id).executeTakeFirst();

  return finding ? normalizeFindingProjection(finding) : null;
}

function normalizeObservationInput<T extends { weakness?: unknown; affectedResource?: unknown }>(
  observation: T,
): T {
  return {
    ...observation,
    ...(observation.weakness === undefined
      ? {}
      : { weakness: observationWeaknessSchema.parse(observation.weakness) }),
    ...(observation.affectedResource === undefined
      ? {}
      : {
          affectedResource: observationAffectedResourceSchema.parse(observation.affectedResource),
        }),
  };
}

function normalizeObservation(observation: Selectable<ObservationTable>): Observation {
  return observationSchema.parse(observation);
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

    async listProjected(): Promise<FindingProjection[]> {
      const findings = await projectionQuery(database).execute();
      return findings.map((finding) => normalizeFindingProjection(finding));
    },

    async getProjectedByID(id: string): Promise<FindingProjection | null> {
      return await getFindingProjectionByID(database, id);
    },

    async createManual(input: CreateManualFindingInput): Promise<CreateManualFindingResult> {
      return await database.transaction().execute(async (transaction) => {
        const createdFinding = await transaction
          .insertInto("finding")
          .values(normalizeFindingInput(input.finding) as Insertable<FindingTable>)
          .returningAll()
          .executeTakeFirstOrThrow();

        const createdObservation = await transaction
          .insertInto("observation")
          .values(
            normalizeObservationInput({
              ...input.observation,
              findingId: createdFinding.id,
            }) as Insertable<ObservationTable>,
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        const links =
          input.vulnerabilityIds.length === 0
            ? []
            : await transaction
                .insertInto("finding_vulnerability")
                .values(
                  input.vulnerabilityIds.map((vulnerabilityId) => ({
                    findingId: createdFinding.id,
                    vulnerabilityId,
                  })),
                )
                .returningAll()
                .execute();

        return {
          finding: normalizeFinding(createdFinding),
          observation: normalizeObservation(createdObservation),
          links: links as FindingVulnerabilityRecord[],
        };
      });
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
