import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { FindingVulnerabilityLink } from "@exposurenexus/contracts/model/finding-vulnerability";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

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
  "finding.vulnerability.linked": {
    finding: Finding;
    vulnerability: VulnerabilityCatalog;
    link: FindingVulnerabilityLink;
  };
  "finding.vulnerability.unlinked": {
    finding: Finding;
    vulnerability: VulnerabilityCatalog;
    link: FindingVulnerabilityLink;
  };
};
