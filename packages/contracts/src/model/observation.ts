import { z } from "zod/v4";

import { observationAffectedResourceSchema } from "./affected-resource.js";
import { dateSchema } from "./date.js";
import { VulnerabilitySeverity } from "./vulnerability.js";
import { weaknessSchema } from "./weakness.js";

/** Scanners whose output can be ingested. */
export enum ScannerSource {
  Nuclei = "nuclei",
  Zap = "zap",
  Semgrep = "semgrep",
  Bearer = "bearer",
  Checkov = "checkov",
  Kics = "kics",
  Trivy = "trivy",
}

/** Origin of an observation: entered manually or ingested from a scanner. */
export enum ObservationSource {
  Manual = "manual",
  Nuclei = ScannerSource.Nuclei,
  Zap = ScannerSource.Zap,
  Semgrep = ScannerSource.Semgrep,
  Bearer = ScannerSource.Bearer,
  Checkov = ScannerSource.Checkov,
  Kics = ScannerSource.Kics,
  Trivy = ScannerSource.Trivy,
}

/**
 * Source-reported fingerprints keyed by namespace, such as `semgrep`.
 * Values are opaque and compare only within one namespace.
 */
export const observationFingerprintsSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)),
);

const observationFields = {
  id: z.uuidv4(),
  findingId: z.uuidv4(),
  title: z.string().nonempty(),
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  remediation: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: weaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  fingerprints: observationFingerprintsSchema,
  observedAt: dateSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
};

// Manual observations have no ingestion; scanner observations always belong to one.
export const observationSchema = z.discriminatedUnion("source", [
  z.strictObject({
    ...observationFields,
    source: z.literal(ObservationSource.Manual),
    ingestionId: z.null(),
  }),
  z.strictObject({
    ...observationFields,
    source: z.enum(ObservationSource).exclude(["Manual"]),
    ingestionId: z.uuidv4(),
  }),
]);

const observationInputSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  remediation: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: weaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  observedAt: dateSchema,
});

export const manualObservationInputSchema = observationInputSchema.partial();

export const updateObservationSchema = observationInputSchema
  .partial()
  .refine((observation) => Object.keys(observation).length > 0, {
    message: "at least one mutable observation field is required",
  });

export const moveObservationInputSchema = z.strictObject({
  targetFindingId: z.uuidv4(),
});

export type ObservationFingerprints = z.infer<typeof observationFingerprintsSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type ManualObservationInput = z.infer<typeof manualObservationInputSchema>;
export type UpdateObservation = z.infer<typeof updateObservationSchema>;
export type MoveObservationInput = z.infer<typeof moveObservationInputSchema>;
