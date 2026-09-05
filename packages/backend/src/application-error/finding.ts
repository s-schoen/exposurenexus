export type FindingApplicationErrorCatalog = {
  "finding.invalid_input": { kind: "validation" };
  "finding.list_failed": { kind: "unexpected" };
  "finding.get_failed": {
    kind: "unexpected";
    details: { findingId: string };
  };
  "finding.asset_unknown": {
    kind: "validation";
    details: { assetId: string };
  };
  "finding.vulnerability_unknown": {
    kind: "validation";
    details: { vulnerabilityId: string };
  };
  "finding.assignee_unknown": {
    kind: "validation";
    details: { assigneeId: string; findingId?: string };
  };
  "finding.manual_create_failed": {
    kind: "unexpected";
    details: { assetId: string };
  };
  "finding.update_failed": {
    kind: "unexpected";
    details: { findingId: string };
  };
  "finding.delete_failed": {
    kind: "unexpected";
    details: { findingId: string };
  };
  "finding.vulnerability_link_target_missing": {
    kind: "missing";
    details: { vulnerabilityId: string };
  };
  "finding.vulnerability_link_failed": {
    kind: "unexpected";
    details: { findingId: string; vulnerabilityId: string };
  };
};
