import { z } from "zod/v4"

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

const findingSchema = z.strictObject({
  id: z.uuidv4(),
  title: z.string().nonempty(),
  severity: z.enum(FindingSeverity),
  status: z.enum(FindingStatus),
  description: z.string().optional(),
  evidence: z.string().optional(),
  mitigation: z.string().optional(),
  source: z.string().optional(),
  fingerprint: z.string(),
  assetId: z.uuidv4(),
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Finding = z.infer<typeof findingSchema>
