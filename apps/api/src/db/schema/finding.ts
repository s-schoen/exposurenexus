import type { Generated } from "kysely"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"

export interface FindingTable {
  id: Generated<string>
  vulnerabilityId: string
  severity: VulnerabilitySeverity
  status: FindingStatus
  source: string
  evidence: string | null
  mitigation: string | null
  assigneeId: string | null
  firstSeen: Date | null
  lastSeen: Date | null
  fingerprint: string
  createdAt: Date
  updatedAt: Date
  assetId: string
  createdBy: string
  updatedBy: string
}
