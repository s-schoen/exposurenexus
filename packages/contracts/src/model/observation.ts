import { z } from "zod/v4";

import { observationAffectedResourceSchema } from "./affected-resource.js";
import { dateSchema } from "./date.js";
import { VulnerabilitySeverity } from "./vulnerability.js";
import { weaknessSchema } from "./weakness.js";

export enum ObservationSource {
  Manual = "manual",
  Nuclei = "nuclei",
}

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
  observedAt: dateSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
};

export const observationSchema = z.discriminatedUnion("source", [
  z.strictObject({
    ...observationFields,
    source: z.literal(ObservationSource.Manual),
    ingestionId: z.null(),
  }),
  z.strictObject({
    ...observationFields,
    source: z.literal(ObservationSource.Nuclei),
    ingestionId: z.uuidv4(),
  }),
]);

const observationInputSchema = z.strictObject({
  title: z.string().trim().min(1),
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

export type Observation = z.infer<typeof observationSchema>;
export type ManualObservationInput = z.infer<typeof manualObservationInputSchema>;
export type UpdateObservation = z.infer<typeof updateObservationSchema>;
export type MoveObservationInput = z.infer<typeof moveObservationInputSchema>;
