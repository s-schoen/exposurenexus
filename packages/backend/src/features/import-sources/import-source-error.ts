export type ImportSourceApplicationErrorCatalog = {
  "import_source.invalid_configuration": { kind: "validation" };
  "import_source.invalid_input": { kind: "validation" };
  "import_source.reserve_failed": { kind: "unexpected" };
  "import_source.claim_failed": { kind: "unexpected"; details: { sourceId: string } };
  "import_source.upload_forbidden": { kind: "denied"; details: { sourceId: string } };
  "import_source.upload_already_attempted": { kind: "conflict"; details: { sourceId: string } };
  "import_source.upload_cancelled": { kind: "conflict"; details: { sourceId: string } };
  "import_source.get_failed": { kind: "unexpected"; details: { sourceId: string } };
  "import_source.get_by_ingestion_failed": {
    kind: "unexpected";
    details: { ingestionId: string };
  };
  "import_source.create_failed": {
    kind: "unexpected";
    details: {
      sourceId: string;
      reason: "size_mismatch" | "transfer_failed" | "finalization_failed";
      cleanupRequired: boolean;
    };
  };
  "import_source.not_available": { kind: "conflict"; details: { sourceId: string } };
  "import_source.bucket_mismatch": { kind: "conflict"; details: { sourceId: string } };
  "import_source.not_found": { kind: "missing"; details: { sourceId: string } };
  "import_source.read_failed": { kind: "unexpected"; details: { sourceId: string } };
  "import_source.delete_failed": {
    kind: "unexpected";
    details: { sourceId: string; reason: "storage_failed" | "bookkeeping_failed" };
  };
};
