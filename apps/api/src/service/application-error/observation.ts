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
  "observation.move_failed": {
    kind: "unexpected";
    details: { findingId: string; observationId: string; targetFindingId: string };
  };
  "observation.move_same_finding": {
    kind: "validation";
    details: { findingId: string; observationId: string; targetFindingId: string };
  };
};
