import type { Finding } from "@openvlp/types/model/finding"

export type FindingEventPayloads = {
  "finding.created": {
    finding: Finding
  }
  "finding.updated": {
    previous: Finding
    current: Finding
  }
  "finding.deleted": {
    finding: Finding
  }
}
