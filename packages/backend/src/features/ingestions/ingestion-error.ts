export type IngestionApplicationErrorCatalog = {
  "ingestion.not_found": { kind: "missing"; details: { ingestionId: string } };
  "ingestion.get_failed": { kind: "unexpected"; details: { ingestionId: string } };
  "ingestion.fail_failed": { kind: "unexpected"; details: { ingestionId: string } };
  "ingestion.plan_invalid": { kind: "validation"; details: { ingestionId: string } };
  "ingestion.plan_stale": { kind: "conflict"; details: { ingestionId: string } };
  "ingestion.record_failed": { kind: "unexpected"; details: { ingestionId: string } };
  "ingestion.source_not_found": { kind: "missing"; details: { ingestionId: string } };
  "ingestion.source_not_submittable": { kind: "conflict"; details: { sourceId: string } };
  "ingestion.submit_cancelled": { kind: "conflict"; details: { sourceId: string } };
  "ingestion.submit_failed": { kind: "unexpected"; details: { sourceId: string } };
};
