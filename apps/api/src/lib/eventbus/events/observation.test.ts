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

it("includes observation update and deletion snapshots in the event catalog", () => {
  const previous = {} as ObservationEventPayloads["observation.updated"]["previous"];
  const current = {} as ObservationEventPayloads["observation.updated"]["current"];
  const updated = createEventPayload({
    subject: "observation.updated",
    source: "finding",
    data: { previous, current },
  });
  const deleted = createEventPayload({
    subject: "observation.deleted",
    source: "finding",
    data: { observation: previous },
  });

  expectTypeOf(updated).toEqualTypeOf<
    DomainEventPayloadBase<"observation.updated", ObservationEventPayloads["observation.updated"]>
  >();
  expectTypeOf(deleted).toEqualTypeOf<
    DomainEventPayloadBase<"observation.deleted", ObservationEventPayloads["observation.deleted"]>
  >();
});
