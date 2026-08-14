import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";

import type { Generated } from "kysely";

export interface FindingTable {
  id: Generated<string>;
  vulnerabilityId: string;
  severity: VulnerabilitySeverity;
  status: FindingStatus;
  source: string;
  evidence: string | null;
  mitigation: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  firstSeen: Date;
  lastSeen: Date;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
  assetId: string;
  createdBy: string;
  updatedBy: string;
}
