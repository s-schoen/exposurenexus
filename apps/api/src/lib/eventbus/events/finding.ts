import type { Finding, FindingProjection } from "@exposurenexus/types/model/finding";
import type { FindingVulnerabilityLink } from "@exposurenexus/types/model/finding-vulnerability";
import type { VulnerabilityCatalog } from "@exposurenexus/types/model/vulnerability";

export type FindingEventPayloads = {
  "finding.created": {
    finding: Finding | FindingProjection;
  };
  "finding.updated": {
    previous: Finding | FindingProjection;
    current: Finding | FindingProjection;
  };
  "finding.deleted": {
    finding: FindingProjection;
  };
  "finding.vulnerability.linked": {
    finding: FindingProjection;
    vulnerability: VulnerabilityCatalog;
    link: FindingVulnerabilityLink;
  };
  "finding.vulnerability.unlinked": {
    finding: FindingProjection;
    vulnerability: VulnerabilityCatalog;
    link: FindingVulnerabilityLink;
  };
};
