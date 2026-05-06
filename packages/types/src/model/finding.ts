import { z } from "zod/v4"
import { vulnerabilitySchema, VulnerabilitySeverity } from "./vulnerability.js"
import { dateSchema } from "./date.js"

export enum FindingSource {
  Manual = "manual",
  Nuclei = "nuclei"
}

export enum FindingStatus {
  Active = "active",
  Inactive = "inactive",
  Confirmed = "confirmed",
  FalsePositive = "false_positive",
  RiskAccepted = "risk_accepted",
  Duplicate = "duplicate",
  OutOfScope = "out_of_scope",
  Mitigated = "mitigated"
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
  firstSeen: dateSchema.nullable(),
  lastSeen: dateSchema.nullable(),
  fingerprint: z.string(),
  assetId: z.uuidv4(),
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
  createdAt: dateSchema,
  updatedAt: dateSchema
})

export const findingSchema = findingInternalSchema.extend({
  vulnerability: vulnerabilitySchema
})

export const createFindingSchema = findingInternalSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
    assigneeId: true,
    fingerprint: true,
    firstSeen: true,
    lastSeen: true
  })
  .extend({
    assigneeId: findingInternalSchema.shape.assigneeId.optional()
  })

export const updateFindingSchema = createFindingSchema.omit({
  assigneeId: true
})

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
    [FindingStatus.Mitigated]: z.int()
  }),
  severity: z.strictObject({
    [VulnerabilitySeverity.Info]: z.int(),
    [VulnerabilitySeverity.Low]: z.int(),
    [VulnerabilitySeverity.Medium]: z.int(),
    [VulnerabilitySeverity.High]: z.int(),
    [VulnerabilitySeverity.Critical]: z.int()
  }),
  source: z.record(z.string(), z.int()),
  assets: z.record(z.uuidv4(), z.int())
})

export type FindingInternal = z.infer<typeof findingInternalSchema>
export type Finding = z.infer<typeof findingSchema>
export type CreateFinding = z.infer<typeof createFindingSchema>
export type UpdateFinding = z.infer<typeof updateFindingSchema>
export type FindingStatistics = z.infer<typeof FindingStatistics>
