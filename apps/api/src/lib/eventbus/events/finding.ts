import type { Finding, FindingProjection } from "@exposurenexus/types/model/finding";
import type { FindingVulnerabilityLink } from "@exposurenexus/types/model/finding-vulnerability";
import type { VulnerabilityCatalog } from "@exposurenexus/types/model/vulnerability";

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
