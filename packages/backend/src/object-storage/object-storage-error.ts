export type ObjectStorageApplicationErrorCatalog = {
  "object_storage.invalid_configuration": { kind: "validation" };
  "object_storage.invalid_input": { kind: "validation" };
  "object_storage.write_failed": {
    kind: "unexpected";
    details: { reason: "size_mismatch" | "transfer_failed"; actualSize: number | null };
  };
  "object_storage.read_failed": { kind: "unexpected" };
  "object_storage.delete_failed": { kind: "unexpected" };
};
