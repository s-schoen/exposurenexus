import { z } from "zod/v4";

import {
  observationAffectedResourceSchema,
  type ObservationAffectedResource,
} from "./affected-resource.js";
import { dateSchema } from "./date.js";
import { VulnerabilitySeverity } from "./vulnerability.js";
import { observationWeaknessSchema, type Weakness } from "./weakness.js";

export enum ObservationSource {
  Manual = "manual",
  Nuclei = "nuclei",
}

export const observationSchema = z.strictObject({
  id: z.uuidv4(),
  findingId: z.uuidv4(),
  ingestionId: z.uuidv4().nullable(),
  source: z.enum(ObservationSource),
  title: z.string().nonempty(),
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  remediation: z.string().nullable(),
  severity: z.enum(VulnerabilitySeverity),
  weakness: observationWeaknessSchema,
  affectedResource: observationAffectedResourceSchema,
  observedAt: dateSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
});

export const createObservationSchema = observationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export type Observation = z.infer<typeof observationSchema>;
export type CreateObservation = z.infer<typeof createObservationSchema>;
export type ObservationWeakness = Weakness;
export type ObservationResource = ObservationAffectedResource;
