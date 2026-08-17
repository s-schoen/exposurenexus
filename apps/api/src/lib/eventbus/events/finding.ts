import type { Finding, FindingProjection } from "@exposurenexus/types/model/finding";

export type FindingEventPayloads = {
  "finding.created": {
    finding: Finding;
  };
  "finding.updated": {
    previous: Finding;
    current: Finding;
  };
  "finding.deleted": {
    finding: FindingProjection;
  };
  "finding.reclassified": {
    source: string;
    oldVulnerabilityId: string;
    targetVulnerabilityId: string;
    updatedCount: number;
  };
};
