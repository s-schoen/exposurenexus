import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { ObservationSource, type Observation } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { expect, expectTypeOf, it } from "vitest";

import { createEventPayload, type DomainEventPayloadBase } from "./index.js";

import type { ObservationEventPayloads } from "./observation.js";

const sourceObservation: Observation = {
  id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  findingId: "2713d833-eb13-4517-ac7c-7761545ed42a",
  ingestionId: "40b71ac1-b003-46b4-a1fc-8e8d384dd140",
  source: ObservationSource.Nuclei,
  title: "Exposed admin endpoint",
  description: null,
  evidence: "GET /admin returned 200",
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: { nuclei: ["admin-panel"] } },
  affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/admin" },
  observedAt: new Date("2026-08-16T10:00:00.000Z"),
  createdAt: new Date("2026-08-16T10:00:00.000Z"),
  updatedAt: new Date("2026-08-16T10:00:00.000Z"),
  createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
  updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
};

it("creates observation events with real source snapshots", () => {
  const event = createEventPayload({
    subject: "observation.created",
    source: "observation",
    data: { observation: sourceObservation },
  });

  expect(event.data.observation).toEqual(sourceObservation);
  expectTypeOf(event).toEqualTypeOf<
    DomainEventPayloadBase<"observation.created", ObservationEventPayloads["observation.created"]>
  >();
});

it("types update, deletion, and move snapshots", () => {
  const moved = {
    ...sourceObservation,
    findingId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  };
  const updated = createEventPayload({
    subject: "observation.updated",
    source: "observation",
    data: { previous: sourceObservation, current: moved },
  });
  const deleted = createEventPayload({
    subject: "observation.deleted",
    source: "observation",
    data: { observation: sourceObservation },
  });
  const movedEvent = createEventPayload({
    subject: "observation.moved",
    source: "observation",
    data: { previous: sourceObservation, current: moved },
  });

  expect(movedEvent.data).toEqual({ previous: sourceObservation, current: moved });
  expectTypeOf(updated).toEqualTypeOf<
    DomainEventPayloadBase<"observation.updated", ObservationEventPayloads["observation.updated"]>
  >();
  expectTypeOf(deleted).toEqualTypeOf<
    DomainEventPayloadBase<"observation.deleted", ObservationEventPayloads["observation.deleted"]>
  >();
  expectTypeOf(movedEvent).toEqualTypeOf<
    DomainEventPayloadBase<"observation.moved", ObservationEventPayloads["observation.moved"]>
  >();
});
