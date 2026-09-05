import { findingSchema, type Finding } from "@exposurenexus/contracts/model/finding";
import { jsonArrayFrom } from "kysely/helpers/postgres";

import type { DatabaseExecutor } from "../database/executor.js";
import type { FindingTable } from "../database/schema/finding.js";
import type { Selectable } from "kysely";

type FindingProjectionRow = Selectable<FindingTable> & {
  vulnerabilities: unknown;
  observationCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
};

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

function normalizeFindingProjection(finding: FindingProjectionRow): Finding {
  return findingSchema.parse(finding);
}

export async function listFindingProjections(database: DatabaseExecutor): Promise<Finding[]> {
  const findings = await projectionQuery(database).execute();
  return findings.map((finding) => normalizeFindingProjection(finding));
}

export async function getFindingProjectionByID(
  database: DatabaseExecutor,
  id: string,
): Promise<Finding | null> {
  const finding = await projectionQuery(database).where("finding.id", "=", id).executeTakeFirst();

  return finding ? normalizeFindingProjection(finding) : null;
}
