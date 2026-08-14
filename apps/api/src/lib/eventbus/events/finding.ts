import type { Finding } from "@exposurenexus/types/model/finding";

export type FindingEventPayloads = {
  "finding.created": {
    finding: Finding;
  };
  "finding.updated": {
    previous: Finding;
    current: Finding;
  };
  "finding.deleted": {
    finding: Finding;
  };
  "finding.reclassified": {
    source: string;
    oldVulnerabilityId: string;
    targetVulnerabilityId: string;
    updatedCount: number;
  };
};
