import type { Generated } from "kysely"
import {
  type FindingSeverity,
  FindingStatus
} from "@openvlp/types/model/finding"

export interface FindingTable {
  id: Generated<string>
  title: string
  severity: FindingSeverity
  status: FindingStatus
  description: string | null
  evidence: string | null
  mitigation: string | null
  source: string | null
  fingerprint: string
  createdAt: Date
  updatedAt: Date
  assetId: string
  createdBy: string
  updatedBy: string
}
