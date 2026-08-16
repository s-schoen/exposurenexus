import type { ObservationAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { ObservationSource } from "@exposurenexus/types/model/observation";
import type { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import type { Weakness } from "@exposurenexus/types/model/weakness";
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
