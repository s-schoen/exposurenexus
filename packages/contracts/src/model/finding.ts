import { z } from "zod/v4";

import { findingAffectedResourceSchema } from "./affected-resource.js";
import { dateSchema } from "./date.js";
import { manualObservationInputSchema } from "./observation.js";
import { vulnerabilityCatalogSchema, VulnerabilitySeverity } from "./vulnerability.js";
import { weaknessSchema } from "./weakness.js";

const dueDateSchema = dateSchema as z.ZodType<Date, Date>;

export enum FindingStatus {
  Active = "active",
  Inactive = "inactive",
  Confirmed = "confirmed",
  FalsePositive = "false_positive",
  RiskAccepted = "risk_accepted",
  Duplicate = "duplicate",
  OutOfScope = "out_of_scope",
  Mitigated = "mitigated",
}

export const findingRecordSchema = z.strictObject({
  id: z.uuidv4(),
  assetId: z.uuidv4(),
  title: z.string().nonempty(),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  assigneeId: z.uuidv4().nullable(),
  dueDate: dueDateSchema.nullable(),
  mitigation: z.string().nullable(),
  weakness: weaknessSchema,
  affectedResource: findingAffectedResourceSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
});

export const findingSchema = findingRecordSchema.extend({
  vulnerabilities: z.array(vulnerabilityCatalogSchema),
  observationCount: z.int().min(0),
  firstSeen: dateSchema.nullable(),
  lastSeen: dateSchema.nullable(),
});

export const createFindingSchema = z.strictObject({
  assetId: z.uuidv4(),
  title: z.string().min(1),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  assigneeId: z.uuidv4().nullable().optional().default(null),
  dueDate: dueDateSchema.nullable().optional().default(null),
  mitigation: z.string().nullable().optional().default(null),
  weakness: weaknessSchema,
  affectedResource: findingAffectedResourceSchema,
  vulnerabilityIds: z.array(z.uuidv4()).default([]),
  observation: manualObservationInputSchema.optional(),
});

const mutableFindingSchema = findingRecordSchema.pick({
  title: true,
  severity: true,
  status: true,
  assigneeId: true,
  dueDate: true,
  mitigation: true,
  weakness: true,
  affectedResource: true,
});

export const updateFindingSchema = mutableFindingSchema
  .partial()
  .refine((finding) => Object.keys(finding).length > 0, {
    message: "at least one mutable finding field is required",
  });

export const FindingStatistics = z.strictObject({
  total: z.int(),
  status: z.strictObject({
    [FindingStatus.Active]: z.int(),
    [FindingStatus.Inactive]: z.int(),
    [FindingStatus.Confirmed]: z.int(),
    [FindingStatus.FalsePositive]: z.int(),
    [FindingStatus.RiskAccepted]: z.int(),
    [FindingStatus.Duplicate]: z.int(),
    [FindingStatus.OutOfScope]: z.int(),
    [FindingStatus.Mitigated]: z.int(),
  }),
  severity: z.strictObject({
    [VulnerabilitySeverity.Info]: z.int(),
    [VulnerabilitySeverity.Low]: z.int(),
    [VulnerabilitySeverity.Medium]: z.int(),
    [VulnerabilitySeverity.High]: z.int(),
    [VulnerabilitySeverity.Critical]: z.int(),
  }),
  assets: z.record(z.uuidv4(), z.int()),
});

export type Finding = z.infer<typeof findingSchema>;
export type CreateManualFinding = z.infer<typeof createFindingSchema>;
export type UpdateFinding = z.infer<typeof updateFindingSchema>;
export type FindingStatistics = z.infer<typeof FindingStatistics>;
