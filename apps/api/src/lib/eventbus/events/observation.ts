import type { Observation } from "@exposurenexus/types/model/observation";

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
};
