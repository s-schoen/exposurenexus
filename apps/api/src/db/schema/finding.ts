import type { FindingAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { FindingStatus } from "@exposurenexus/types/model/finding";
import type { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import type { Weakness } from "@exposurenexus/types/model/weakness";
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
