import type { Observation } from "@exposurenexus/types/model/observation";

export type ObservationEventPayloads = {
  "observation.created": {
    observation: Observation;
  };
};
