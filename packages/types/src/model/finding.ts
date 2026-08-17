import { z } from "zod/v4";

import {
  findingAffectedResourceSchema,
  type FindingAffectedResource,
} from "./affected-resource.js";
import { dateSchema, utcStartDateSchema } from "./date.js";
import {
  manualObservationInputSchema,
  ObservationSource,
  type ManualObservationInput,
} from "./observation.js";
import {
  vulnerabilityCatalogSchema,
  vulnerabilitySchema,
  VulnerabilitySeverity,
} from "./vulnerability.js";
import { findingWeaknessSchema, type Weakness } from "./weakness.js";

const dueDateSchema = utcStartDateSchema as z.ZodType<Date, Date>;

export enum FindingSource {
  Manual = "manual",
  Nuclei = "nuclei",
}

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

export const findingInternalSchema = z.strictObject({
  id: z.uuidv4(),
  vulnerabilityId: z.uuidv4(),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  source: z.string().nonempty(),
  evidence: z.string().nullable(),
  mitigation: z.string().nullable(),
  assigneeId: z.uuidv4().nullable(),
  dueDate: dueDateSchema.nullable(),
  firstSeen: dateSchema,
  lastSeen: dateSchema,
  fingerprint: z.string(),
  assetId: z.uuidv4(),
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const findingSchema = findingInternalSchema.extend({
  vulnerability: vulnerabilitySchema,
});

export const findingPersistenceSchema = z.strictObject({
  id: z.uuidv4(),
  assetId: z.uuidv4(),
  title: z.string().nonempty(),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  assigneeId: z.uuidv4().nullable(),
  dueDate: dueDateSchema.nullable(),
  mitigation: z.string().nullable(),
  weakness: findingWeaknessSchema,
  affectedResource: findingAffectedResourceSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
});

export const findingProjectionSchema = z.strictObject({
  id: z.uuidv4(),
  assetId: z.uuidv4(),
  title: z.string().nonempty(),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  assigneeId: z.uuidv4().nullable(),
  dueDate: dueDateSchema.nullable(),
  mitigation: z.string().nullable(),
  weakness: findingWeaknessSchema,
  affectedResource: findingAffectedResourceSchema,
  vulnerabilities: z.array(vulnerabilityCatalogSchema),
  observationCount: z.int().min(0),
  observingSources: z.array(z.enum(ObservationSource)),
  firstSeen: dateSchema.nullable(),
  lastSeen: dateSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
});

export const legacyCreateFindingSchema = findingInternalSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
    assigneeId: true,
    dueDate: true,
    fingerprint: true,
    firstSeen: true,
    lastSeen: true,
  })
  .extend({
    assigneeId: findingInternalSchema.shape.assigneeId.optional(),
    dueDate: findingInternalSchema.shape.dueDate.optional(),
  });

export const legacyUpdateFindingSchema = legacyCreateFindingSchema
  .omit({ vulnerabilityId: true, assetId: true, assigneeId: true, dueDate: true })
  .extend({
    assigneeId: findingInternalSchema.shape.assigneeId,
    dueDate: findingInternalSchema.shape.dueDate,
  });

export const createFindingSchema = z.strictObject({
  assetId: z.uuidv4(),
  title: z.string().trim().min(1),
  severity: z.enum(VulnerabilitySeverity),
  status: z.enum(FindingStatus),
  assigneeId: z.uuidv4().nullable().optional().default(null),
  dueDate: dueDateSchema.nullable().optional().default(null),
  mitigation: z.string().nullable().optional().default(null),
  weakness: findingWeaknessSchema,
  affectedResource: findingAffectedResourceSchema,
  vulnerabilityIds: z
    .array(z.uuidv4())
    .default([])
    .transform((ids) => [...new Set(ids)]),
  observation: manualObservationInputSchema.optional(),
});

export const updateFindingSchema = z
  .strictObject({
    title: findingPersistenceSchema.shape.title.optional(),
    severity: findingPersistenceSchema.shape.severity.optional(),
    status: findingPersistenceSchema.shape.status.optional(),
    assigneeId: findingPersistenceSchema.shape.assigneeId.optional(),
    dueDate: findingPersistenceSchema.shape.dueDate.optional(),
    mitigation: findingPersistenceSchema.shape.mitigation.optional(),
    weakness: findingPersistenceSchema.shape.weakness.optional(),
    affectedResource: findingPersistenceSchema.shape.affectedResource.optional(),
  })
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
  source: z.record(z.string(), z.int()),
  assets: z.record(z.uuidv4(), z.int()),
});

export type FindingInternal = z.infer<typeof findingInternalSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type FindingPersistence = z.infer<typeof findingPersistenceSchema>;
export type FindingProjection = z.infer<typeof findingProjectionSchema>;
export type FindingWeakness = Weakness;
export type FindingResource = FindingAffectedResource;
export type CreateFinding = z.infer<typeof createFindingSchema>;
export type CreateManualFinding = CreateFinding;
export type LegacyCreateFinding = z.infer<typeof legacyCreateFindingSchema>;
export type UpdateFinding = z.infer<typeof updateFindingSchema>;
export type FindingStatistics = z.infer<typeof FindingStatistics>;
export { manualObservationInputSchema };
export type { ManualObservationInput };
