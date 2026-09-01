import {
  findingAffectedResourceSchema,
  observationAffectedResourceSchema,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  findingRecordSchema,
  findingSchema,
  type Finding,
} from "@exposurenexus/contracts/model/finding";
import {
  findingVulnerabilityLinkSchema,
  type FindingVulnerabilityLink,
} from "@exposurenexus/contracts/model/finding-vulnerability";
import { observationSchema, type Observation } from "@exposurenexus/contracts/model/observation";
import { weaknessSchema } from "@exposurenexus/contracts/model/weakness";
import {
  type Kysely,
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";

import type { CreateObservationRecord } from "./observation.js";
import type { Database } from "@exposurenexus/backend/database";
import type { FindingTable } from "@exposurenexus/backend/database";
import type { ObservationTable } from "@exposurenexus/backend/database";

export type FindingRecord = Selectable<FindingTable>;
type FindingProjectionRow = FindingRecord & {
  vulnerabilities: unknown;
  observationCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
};
export type CreateFindingRecord = Insertable<FindingTable>;
export type UpdateFindingRecord = Updateable<FindingTable>;
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
  links: FindingVulnerabilityLink[];
  projection: Finding;
}

export interface FindingVulnerabilityMutationInput {
  findingId: string;
  vulnerabilityId: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface FindingVulnerabilityMutation {
  link: FindingVulnerabilityLink | null;
  changed: boolean;
}

export interface FindingRepository {
  list(): Promise<FindingRecord[]>;
  getByID(id: string): Promise<FindingRecord | null>;
  listProjected(): Promise<Finding[]>;
  getProjectedByID(id: string): Promise<Finding | null>;
  createManual(input: CreateManualFindingInput): Promise<CreateManualFindingResult>;
  linkVulnerability(
    input: FindingVulnerabilityMutationInput,
  ): Promise<FindingVulnerabilityMutation>;
  unlinkVulnerability(
    input: FindingVulnerabilityMutationInput,
  ): Promise<FindingVulnerabilityMutation>;
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

function normalizeObservation(observation: Selectable<ObservationTable>): Observation {
  return observationSchema.parse(observation);
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
          .values({
            ...input.finding,
            weakness: weaknessSchema.parse(input.finding.weakness),
            affectedResource: findingAffectedResourceSchema.parse(input.finding.affectedResource),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const createdObservation = await transaction
          .insertInto("observation")
          .values({
            ...input.observation,
            findingId: createdFinding.id,
            weakness: weaknessSchema.parse(input.observation.weakness),
            affectedResource: observationAffectedResourceSchema.parse(
              input.observation.affectedResource,
            ),
          })
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
          links: links.map((link) => findingVulnerabilityLinkSchema.parse(link)),
          projection,
        };
      });
    },

    async linkVulnerability(
      input: FindingVulnerabilityMutationInput,
    ): Promise<FindingVulnerabilityMutation> {
      return await database.transaction().execute(async (transaction) => {
        const inserted = await transaction
          .insertInto("finding_vulnerability")
          .values({ findingId: input.findingId, vulnerabilityId: input.vulnerabilityId })
          .onConflict((conflict) => conflict.columns(["findingId", "vulnerabilityId"]).doNothing())
          .returningAll()
          .executeTakeFirst();

        if (!inserted) {
          const existing = await transaction
            .selectFrom("finding_vulnerability")
            .selectAll()
            .where("findingId", "=", input.findingId)
            .where("vulnerabilityId", "=", input.vulnerabilityId)
            .executeTakeFirstOrThrow();

          return {
            link: findingVulnerabilityLinkSchema.parse(existing),
            changed: false,
          };
        }

        await transaction
          .updateTable("finding")
          .set({
            updatedAt: input.updatedAt,
            updatedBy: input.updatedBy,
          })
          .where("id", "=", input.findingId)
          .executeTakeFirstOrThrow();

        return {
          link: findingVulnerabilityLinkSchema.parse(inserted),
          changed: true,
        };
      });
    },

    async unlinkVulnerability(
      input: FindingVulnerabilityMutationInput,
    ): Promise<FindingVulnerabilityMutation> {
      return await database.transaction().execute(async (transaction) => {
        const deleted = await transaction
          .deleteFrom("finding_vulnerability")
          .where("findingId", "=", input.findingId)
          .where("vulnerabilityId", "=", input.vulnerabilityId)
          .returningAll()
          .executeTakeFirst();

        if (!deleted) {
          return {
            link: null,
            changed: false,
          };
        }

        await transaction
          .updateTable("finding")
          .set({
            updatedAt: input.updatedAt,
            updatedBy: input.updatedBy,
          })
          .where("id", "=", input.findingId)
          .executeTakeFirstOrThrow();

        return {
          link: findingVulnerabilityLinkSchema.parse(deleted),
          changed: true,
        };
      });
    },

    async create(finding: CreateFindingRecord): Promise<FindingRecord> {
      const created = await database
        .insertInto("finding")
        .values({
          ...finding,
          weakness: weaknessSchema.parse(finding.weakness),
          affectedResource: findingAffectedResourceSchema.parse(finding.affectedResource),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return normalizeFinding(created);
    },

    async updateByID(id: string, finding: UpdateFindingRecord): Promise<FindingRecord | null> {
      const updated = await database
        .updateTable("finding")
        .set({
          ...finding,
          ...(finding.weakness === undefined
            ? {}
            : { weakness: weaknessSchema.parse(finding.weakness) }),
          ...(finding.affectedResource === undefined
            ? {}
            : {
                affectedResource: findingAffectedResourceSchema.parse(finding.affectedResource),
              }),
        })
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
