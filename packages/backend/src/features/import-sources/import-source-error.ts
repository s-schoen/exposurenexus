export type ImportSourceApplicationErrorCatalog = {
  "import_source.invalid_configuration": { kind: "validation" };
  "import_source.invalid_input": { kind: "validation" };
  "import_source.reserve_failed": { kind: "unexpected" };
  "import_source.get_failed": { kind: "unexpected"; details: { sourceId: string } };
  "import_source.create_failed": {
    kind: "unexpected";
    details: {
      sourceId: string;
      reason: "size_mismatch" | "transfer_failed" | "finalization_failed";
      cleanupState: "pending" | "completed" | "failed";
    };
  };
  "import_source.not_available": { kind: "conflict"; details: { sourceId: string } };
  "import_source.not_found": { kind: "missing"; details: { sourceId: string } };
  "import_source.read_failed": { kind: "unexpected"; details: { sourceId: string } };
};
