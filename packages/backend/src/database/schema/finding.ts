import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { FindingStatus } from "@exposurenexus/contracts/model/finding";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";
import type { Generated } from "kysely";

export interface FindingTable {
  id: Generated<string>;
  assetId: string;
  title: string;
  severity: VulnerabilitySeverity;
  status: FindingStatus;
  assigneeId: string | null;
  dueDate: Date | null;
  mitigation: string | null;
  weakness: Weakness;
  affectedResource: FindingAffectedResource;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface FindingVulnerabilityTable {
  findingId: string;
  vulnerabilityId: string;
}
