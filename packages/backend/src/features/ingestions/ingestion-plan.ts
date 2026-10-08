import {
  findingAffectedResourceSchema,
  observationAffectedResourceSchema,
  type FindingAffectedResource,
  type ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";
import { dateSchema } from "@exposurenexus/contracts/model/date";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { z } from "zod/v4";

import { fingerprintsSchema } from "../findings/fingerprint-rules.js";
import { weaknessSchema } from "../findings/weakness-rules.js";

import type { ObservationFingerprints } from "@exposurenexus/contracts/model/observation";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";

/** An observation to persist; its source, ingestion and actor come from the ingestion. */
export interface PlannedObservation {
  title: string;
  description: string | null;
  evidence: string | null;
  remediation: string | null;
  severity: VulnerabilitySeverity;
  weakness: Weakness;
  affectedResource: ObservationAffectedResource;
  fingerprints: ObservationFingerprints;
  observedAt: Date;
}

/** A fully decided ingestion outcome: findings to create and observations to attach. */
export interface IngestionPlan {
  newFindings: {
    assetId: string;
    finding: {
      title: string;
      severity: VulnerabilitySeverity;
      weakness: Weakness;
      affectedResource: FindingAffectedResource;
    };
    observations: PlannedObservation[];
  }[];
  attachments: {
    findingId: string;
    assetId: string;
    observations: PlannedObservation[];
  }[];
}

const plannedObservationSchema = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  remediation: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: weaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  fingerprints: fingerprintsSchema,
  observedAt: dateSchema,
});

// Lowercase IDs compare and sort like Postgres UUIDs.
const idSchema = z.uuidv4().transform((id) => id.toLowerCase());

export const ingestionPlanSchema = z.strictObject({
  newFindings: z.array(
    z.strictObject({
      assetId: idSchema,
      finding: z.strictObject({
        title: z.string().trim().min(1),
        severity: z.enum(VulnerabilitySeverity),
        weakness: weaknessSchema,
        affectedResource: findingAffectedResourceSchema,
      }),
      observations: z.array(plannedObservationSchema).min(1),
    }),
  ),
  attachments: z.array(
    z.strictObject({
      findingId: idSchema,
      assetId: idSchema,
      observations: z.array(plannedObservationSchema).min(1),
    }),
  ),
});

export type ValidIngestionPlan = z.output<typeof ingestionPlanSchema>;
