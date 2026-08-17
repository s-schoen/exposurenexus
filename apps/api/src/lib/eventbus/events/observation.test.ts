import { expectTypeOf, it } from "vitest";

import { createEventPayload, type DomainEventPayloadBase } from "./index.js";

import type { ObservationEventPayloads } from "./observation.js";

it("includes observation created snapshots in the event catalog", () => {
  const observation = {} as ObservationEventPayloads["observation.created"]["observation"];
  const event = createEventPayload({
    subject: "observation.created",
    source: "finding",
    data: { observation },
  });

  expectTypeOf(event).toEqualTypeOf<
    DomainEventPayloadBase<"observation.created", ObservationEventPayloads["observation.created"]>
  >();
});
