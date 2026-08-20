import {
  findingAffectedResourceSchema,
  type FindingAffectedResource,
  observationAffectedResourceSchema,
} from "@exposurenexus/types/model/affected-resource";
import {
  findingRecordSchema,
  findingSchema,
  type Finding,
} from "@exposurenexus/types/model/finding";
import { observationSchema, type Observation } from "@exposurenexus/types/model/observation";
import { weaknessSchema, type Weakness } from "@exposurenexus/types/model/weakness";
import {
  type Kysely,
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";

import type { Database } from "../db/index.js";
import type { FindingTable } from "../db/schema/finding.js";
import type { ObservationTable } from "../db/schema/observation.js";
import type { FindingVulnerabilityRecord } from "./finding-vulnerability.js";
import type { CreateObservationRecord } from "./observation.js";

export type FindingRecord = Selectable<FindingTable>;
type FindingProjectionRow = FindingRecord & {
  vulnerabilities: unknown;
  observationCount: number;
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
  projection: Finding;
}

export interface FindingRepository {
  list(): Promise<FindingRecord[]>;
  getByID(id: string): Promise<FindingRecord | null>;
  listProjected(): Promise<Finding[]>;
  getProjectedByID(id: string): Promise<Finding | null>;
  createManual(input: CreateManualFindingInput): Promise<CreateManualFindingResult>;
  create(finding: CreateFindingRecord): Promise<FindingRecord>;
  updateByID(id: string, finding: UpdateFindingRecord): Promise<FindingRecord | null>;
  deleteByID(id: string): Promise<FindingRecord | null>;
  countBy(field: FindingCountField): Promise<Record<string, number>>;
}

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

function normalizeFinding(finding: FindingRecord): FindingRecord {
  return findingRecordSchema.parse(finding) as FindingRecord;
}

function normalizeFindingProjection(finding: FindingProjectionRow): Finding {
  return findingSchema.parse(finding);
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
  // Aggregate observation history without dropping findings that have no observations.
  return database
    .selectFrom("finding")
    .leftJoin("observation", "observation.findingId", "finding.id")
    .selectAll("finding")
    .select((expression) => [
      expression
        .cast<number>(expression.fn.count("observation.id").distinct(), "integer")
        .as("observationCount"),
      expression.fn.min("observation.observedAt").as("firstSeen"),
      expression.fn.max("observation.observedAt").as("lastSeen"),
      // Correlate each finding with an ordered, API-shaped array of its catalog entries.
      jsonArrayFrom(
        expression
          .selectFrom("finding_vulnerability as projection_link")
          .innerJoin(
            "vulnerability as projection_vulnerability",
            "projection_vulnerability.id",
            "projection_link.vulnerabilityId",
          )
          .select([
            "projection_vulnerability.id",
            "projection_vulnerability.type",
            "projection_vulnerability.identifier",
            "projection_vulnerability.title",
            "projection_vulnerability.description",
            "projection_vulnerability.severity",
            "projection_vulnerability.metadata",
            "projection_vulnerability.createdAt",
            "projection_vulnerability.updatedAt",
            "projection_vulnerability.createdBy",
            "projection_vulnerability.updatedBy",
          ])
          .whereRef("projection_link.findingId", "=", "finding.id")
          .orderBy("projection_vulnerability.type")
          .orderBy("projection_vulnerability.identifier"),
      ).as("vulnerabilities"),
    ])
    .groupBy(findingProjectionGroupColumns)
    .orderBy("finding.updatedAt", "desc");
}

export async function getFindingProjectionByID(
  database: DatabaseExecutor,
  id: string,
): Promise<Finding | null> {
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
      : { weakness: weaknessSchema.parse(observation.weakness) }),
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
      : { weakness: weaknessSchema.parse(finding.weakness) as Weakness }),
    ...(finding.affectedResource === undefined
      ? {}
      : {
          affectedResource: findingAffectedResourceSchema.parse(
            finding.affectedResource,
          ) as FindingAffectedResource,
        }),
  };
}

export function createFindingRepository(database: Kysely<Database>): FindingRepository {
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

    async listProjected(): Promise<Finding[]> {
      const findings = await projectionQuery(database).execute();
      return findings.map((finding) => normalizeFindingProjection(finding));
    },

    async getProjectedByID(id: string): Promise<Finding | null> {
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

        const projection = await getFindingProjectionByID(transaction, createdFinding.id);
        if (!projection) {
          throw new Error("created manual finding was not available as a projection");
        }

        return {
          finding: normalizeFinding(createdFinding),
          observation: normalizeObservation(createdObservation),
          links: links as FindingVulnerabilityRecord[],
          projection,
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
