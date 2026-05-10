export type FindingApplicationErrorCatalog = {
  "finding.list_failed": { kind: "unexpected" }
  "finding.get_failed": {
    kind: "unexpected"
    details: { findingId: string }
  }
  "finding.asset_unknown": {
    kind: "validation"
    details: { assetId: string }
  }
  "finding.vulnerability_unknown": {
    kind: "validation"
    details: { vulnerabilityId: string }
  }
  "finding.assignee_unknown": {
    kind: "validation"
    details: { assigneeId: string; findingId?: string }
  }
  "finding.related_resource_unknown": {
    kind: "validation"
    details: {
      assetId: string
      vulnerabilityId: string
      assigneeId: string | null
    }
  }
  "finding.create_failed": {
    kind: "unexpected"
    details: { assetId: string; vulnerabilityId: string }
  }
  "finding.update_failed": {
    kind: "unexpected"
    details: { findingId: string }
  }
  "finding.create_or_update_failed": {
    kind: "unexpected"
    details: { assetId: string; vulnerabilityId: string }
  }
  "finding.delete_failed": {
    kind: "unexpected"
    details: { findingId: string }
  }
  "finding.reclassification_old_vulnerability_missing": {
    kind: "missing"
    details: { vulnerabilityId: string }
  }
  "finding.reclassification_target_vulnerability_missing": {
    kind: "missing"
    details: { vulnerabilityId: string }
  }
  "finding.reclassification_failed": {
    kind: "unexpected"
    details: {
      source: string
      oldVulnerabilityId: string
      targetVulnerabilityId: string
    }
  }
}
