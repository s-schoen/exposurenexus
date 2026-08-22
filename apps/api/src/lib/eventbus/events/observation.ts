import type { Observation } from "@exposurenexus/contracts/model/observation";

export type ObservationEventPayloads = {
  "observation.created": {
    observation: Observation;
  };
  "observation.updated": {
    previous: Observation;
    current: Observation;
  };
  "observation.deleted": {
    observation: Observation;
  };
  "observation.moved": {
    previous: Observation;
    current: Observation;
  };
};
