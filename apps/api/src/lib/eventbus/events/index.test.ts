import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createTestUser } from "../../../test/app.js";
import {
  createDomainEventEmitter,
  createEventPayload,
  type DomainEvent,
  type DomainEventPayloadBase,
  type EventSubjects,
} from "./index.js";

import type { AssetEventPayloads } from "./asset.js";
import type { AuthEventPayloads } from "./auth.js";
import type { CustomFieldEventPayloads } from "./custom-field.js";
import type { FindingEventPayloads } from "./finding.js";
import type { RoleEventPayloads } from "./role.js";
import type { UserEventPayloads } from "./user.js";
import type { VulnerabilityEventPayloads } from "./vulnerability.js";

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("createDomainEventPayload", () => {
  it("creates domain events with a generated id and timestamp", () => {
    const before = new Date();
    const user = createTestUser();

    const event = createEventPayload({
      subject: "user.created",
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      data: { user },
    });

    const after = new Date();

    expect(event).toMatchObject({
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      subject: "user.created",
      data: { user },
    });
    expect(event.id).toMatch(uuidV4Regex);
    expect(event.time.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.time.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("allows generated metadata to be overridden", () => {
    const time = new Date("2026-01-01T00:00:00.000Z");
    const user = createTestUser();

    const event = createEventPayload({
      id: "event-1",
      time,
      subject: "user.created",
      source: "user-service",
      data: { user },
    });

    expect(event.id).toBe("event-1");
    expect(event.time).toBe(time);
  });

  it("types event data from the subject", () => {
    const user = createTestUser();

    const event = createEventPayload({
      subject: "user.created",
      source: "user-service",
      data: { user },
    });

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<"user.created", UserEventPayloads["user.created"]>
    >();
    expectTypeOf(event).toMatchTypeOf<DomainEvent>();

    const assertRejectedTypes = () => {
      createEventPayload({
        subject: "user.created",
        source: "user-service",
        // @ts-expect-error data must match the selected subject
        data: { previous: user, current: user },
      });

      createEventPayload({
        // @ts-expect-error only known event subjects can be created
        subject: "role.archived",
        source: "asset-service",
        data: { user },
      });
    };
    void assertRejectedTypes;
  });

  it("includes auth events in the aggregate event catalog", () => {
    const user = createTestUser();
    const session = {
      id: "48f2e3a5-4560-4a47-85b6-137106940bbb",
      userId: user.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-26T08:00:00.000Z"),
      expiresAt: new Date("2026-04-26T20:00:00.000Z"),
    };

    const event = createEventPayload({
      subject: "auth.session.created",
      source: "auth-service",
      data: { session },
    });

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<"auth.session.created", AuthEventPayloads["auth.session.created"]>
    >();
    expectTypeOf(event).toMatchTypeOf<DomainEvent>();
  });

  it("includes finding events in the aggregate event catalog", () => {
    const user = createTestUser();
    const vulnerability = {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      title: "Exposed Admin Endpoint",
      severity: "high",
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date("2026-05-07T09:00:00.000Z"),
      updatedAt: new Date("2026-05-07T09:00:00.000Z"),
    };
    const finding = {
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      status: "active",
      assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      title: "Exposed Admin Endpoint",
      severity: vulnerability.severity,
      mitigation: "Restrict access to internal networks",
      assigneeId: null,
      dueDate: null,
      weakness: { identifiers: {} },
      affectedResource: { type: "unspecified" },
      vulnerabilities: [],
      observationCount: 1,
      firstSeen: new Date("2026-05-07T09:10:00.000Z"),
      lastSeen: new Date("2026-05-07T09:10:00.000Z"),
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date("2026-05-07T09:10:00.000Z"),
      updatedAt: new Date("2026-05-07T09:10:00.000Z"),
    } as FindingEventPayloads["finding.created"]["finding"];

    const event = createEventPayload({
      subject: "finding.created",
      source: "finding",
      data: { finding },
    });

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<"finding.created", FindingEventPayloads["finding.created"]>
    >();
    expectTypeOf(event).toMatchTypeOf<DomainEvent>();
  });

  it("includes catalog vulnerability events in the aggregate event catalog", () => {
    const user = createTestUser();
    const vulnerability = {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      type: VulnerabilityType.Cve,
      identifier: "CVE-2026-0001",
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      metadata: { cwe: 284 },
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: new Date("2026-05-07T09:00:00.000Z"),
      updatedAt: new Date("2026-05-07T09:00:00.000Z"),
    } as VulnerabilityEventPayloads["vulnerability.created"]["vulnerability"];
    const event = createEventPayload({
      subject: "vulnerability.created",
      source: "vulnerability",
      data: { vulnerability },
    });

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<
        "vulnerability.created",
        VulnerabilityEventPayloads["vulnerability.created"]
      >
    >();
    expectTypeOf(event).toMatchTypeOf<DomainEvent>();
  });

  it("includes asset events in the aggregate event catalog", () => {
    const asset = {
      id: "76b1885f-2d28-4b7d-93da-2751ff385aa3",
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      customFields: [],
    } as AssetEventPayloads["asset.created"]["asset"];

    const event = createEventPayload({
      subject: "asset.updated",
      source: "asset",
      data: {
        previous: asset,
        current: {
          ...asset,
          ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        },
      },
    });

    expectTypeOf(event).toEqualTypeOf<
      DomainEventPayloadBase<"asset.updated", AssetEventPayloads["asset.updated"]>
    >();
    expectTypeOf(event).toMatchTypeOf<DomainEvent>();
  });

  it("includes custom field events in the aggregate event catalog", () => {
    const customFieldDefinition = {
      id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
      key: "category",
      name: "Category",
      required: false,
      type: "text",
      defaultValue: null,
    } as CustomFieldEventPayloads["custom-field.created"]["customFieldDefinition"];

    const createdEvent = createEventPayload({
      subject: "custom-field.created",
      source: "asset-custom-field",
      data: { customFieldDefinition },
    });

    expectTypeOf(createdEvent).toEqualTypeOf<
      DomainEventPayloadBase<
        "custom-field.created",
        CustomFieldEventPayloads["custom-field.created"]
      >
    >();
    expectTypeOf(createdEvent).toMatchTypeOf<DomainEvent>();

    const updatedEvent = createEventPayload({
      subject: "custom-field.updated",
      source: "asset-custom-field",
      data: {
        previous: customFieldDefinition,
        current: {
          ...customFieldDefinition,
          name: "Asset Category",
        },
      },
    });

    expectTypeOf(updatedEvent).toEqualTypeOf<
      DomainEventPayloadBase<
        "custom-field.updated",
        CustomFieldEventPayloads["custom-field.updated"]
      >
    >();
    expectTypeOf(updatedEvent).toMatchTypeOf<DomainEvent>();

    const deletedEvent = createEventPayload({
      subject: "custom-field.deleted",
      source: "asset-custom-field",
      data: { customFieldDefinition },
    });

    expectTypeOf(deletedEvent).toEqualTypeOf<
      DomainEventPayloadBase<
        "custom-field.deleted",
        CustomFieldEventPayloads["custom-field.deleted"]
      >
    >();
    expectTypeOf(deletedEvent).toMatchTypeOf<DomainEvent>();
  });

  it("includes role events in the aggregate event catalog", () => {
    const role = {
      id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
      name: "analyst",
      permissions: [{ resource: "asset", verb: "read" }],
    } as RoleEventPayloads["role.created"]["role"];

    const createdEvent = createEventPayload({
      subject: "role.created",
      source: "role",
      data: {
        role,
      },
    });

    expectTypeOf(createdEvent).toEqualTypeOf<
      DomainEventPayloadBase<"role.created", RoleEventPayloads["role.created"]>
    >();
    expectTypeOf(createdEvent).toMatchTypeOf<DomainEvent>();

    const updatedEvent = createEventPayload({
      subject: "role.updated",
      source: "role",
      data: {
        previous: role,
        current: {
          ...role,
          name: "security-analyst",
        },
      },
    });

    expectTypeOf(updatedEvent).toEqualTypeOf<
      DomainEventPayloadBase<"role.updated", RoleEventPayloads["role.updated"]>
    >();
    expectTypeOf(updatedEvent).toMatchTypeOf<DomainEvent>();
  });

  it("creates source-bound emitters with subject-specific payload types", () => {
    const emittedEvents: DomainEvent[] = [];
    const user = createTestUser();
    const emitUserEvent = createDomainEventEmitter<EventSubjects<UserEventPayloads>>(
      {
        async emit(event) {
          emittedEvents.push(event);
        },
      },
      "user-service",
    );

    emitUserEvent(
      "user.created",
      { user },
      {
        actor: "admin-user",
        correlationId: "correlation-1",
      },
    );

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toMatchObject({
      source: "user-service",
      actor: "admin-user",
      correlationId: "correlation-1",
      subject: "user.created",
      data: { user },
    });

    const assertRejectedTypes = () => {
      emitUserEvent(
        // @ts-expect-error emitter only accepts the configured subject subset
        "user.deleted",
        { user },
      );

      emitUserEvent(
        "user.created",
        // @ts-expect-error data must match the selected subject
        { previous: user, current: user },
      );
    };
    void assertRejectedTypes;
  });
});
