export type IngestionApplicationErrorCatalog = {
  "ingestion.source_not_submittable": { kind: "conflict"; details: { sourceId: string } };
  "ingestion.submit_cancelled": { kind: "conflict"; details: { sourceId: string } };
  "ingestion.submit_failed": { kind: "unexpected"; details: { sourceId: string } };
};
