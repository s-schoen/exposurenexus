export type ObservationApplicationErrorCatalog = {
  "observation.list_failed": {
    kind: "unexpected";
    details: { findingId: string };
  };
  "observation.create_failed": {
    kind: "unexpected";
    details: { findingId: string };
  };
  "observation.update_failed": {
    kind: "unexpected";
    details: { findingId: string; observationId: string };
  };
  "observation.delete_failed": {
    kind: "unexpected";
    details: { findingId: string; observationId: string };
  };
};
