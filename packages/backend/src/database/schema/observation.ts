import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { ObservationSource } from "@exposurenexus/contracts/model/observation";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";
import type { Generated } from "kysely";

export interface ObservationTable {
  id: Generated<string>;
  findingId: string;
  ingestionId: string | null;
  source: ObservationSource;
  title: string;
  description: string | null;
  evidence: string | null;
  remediation: string | null;
  severity: VulnerabilitySeverity;
  weakness: Weakness;
  affectedResource: ObservationAffectedResource;
  observedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}
