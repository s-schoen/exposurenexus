import { z } from "zod/v4"

export enum FindingSource {
  Manual = "manual",
  Nuclei = "nuclei"
}

export enum FindingSeverity {
  Info = "info",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical"
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

export const findingSchema = z.strictObject({
  id: z.uuidv4(),
  title: z.string().nonempty(),
  severity: z.enum(FindingSeverity),
  status: z.enum(FindingStatus),
  description: z.string().nullable(),
  evidence: z.string().nullable(),
  mitigation: z.string().nullable(),
  source: z.string().nullable(),
  firstSeen: z.date().nullable(),
  lastSeen: z.date().nullable(),
  fingerprint: z.string(),
  assetId: z.uuidv4(),
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const createFindingSchema = findingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  fingerprint: true,
  firstSeen: true,
  lastSeen: true
})

export type Finding = z.infer<typeof findingSchema>
export type CreateFinding = z.infer<typeof createFindingSchema>
