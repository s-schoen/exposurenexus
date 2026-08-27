import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createEvent, eventAttributesSchema, EventSource, generateEventID } from "./events.js";

import type { Event } from "./events.js";

const validAttributes = {
  specversion: "1.0",
  id: "550e8400-e29b-41d4-a716-446655440000",
  source: "/services/api",
  type: "exposurenexus.test.created",
  time: "2026-08-23T12:00:00.000Z",
  datacontenttype: "application/json",
} as const;

describe("event attributes schema", () => {
  it("accepts the supported CloudEvents attribute profile", () => {
    expect(eventAttributesSchema.parse(validAttributes)).toEqual(validAttributes);
  });

  it.each([
    ["specversion", "1.0.1"],
    ["id", "not-a-uuid"],
    ["source", "services/api"],
    ["source", "/Services/api"],
    ["source", "/services"],
    ["source", "/services/api?version=1"],
    ["type", 42],
    ["time", "not-a-timestamp"],
    ["datacontenttype", "text/plain"],
    ["subject", 42],
  ])("rejects an invalid %s attribute", (attribute, value) => {
    expect(() =>
      eventAttributesSchema.parse({
        ...validAttributes,
        [attribute]: value,
      }),
    ).toThrow();
  });

  it("rejects attributes outside the strict envelope", () => {
    expect(() =>
      eventAttributesSchema.parse({
        ...validAttributes,
        extension: "not supported",
      }),
    ).toThrow();
  });

  it.each(["specversion", "id", "source", "type", "time", "datacontenttype"])(
    "requires %s",
    (attribute) => {
      const attributes = { ...validAttributes };
      delete attributes[attribute as keyof typeof attributes];

      expect(() => eventAttributesSchema.parse(attributes)).toThrow();
    },
  );

  it("accepts an optional subject", () => {
    expect(
      eventAttributesSchema.parse({
        ...validAttributes,
        subject: "finding-1",
      }),
    ).toEqual({
      ...validAttributes,
      subject: "finding-1",
    });
  });
});

describe("createEvent", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an event with generated metadata and the default source", () => {
    const time = new Date("2026-08-23T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(time);

    const event = createEvent({
      type: "exposurenexus.test.created",
      data: { findingId: "finding-1" },
    });

    expect(event).toMatchObject({
      specversion: "1.0",
      source: EventSource.EVENT_SOURCE_API,
      type: "exposurenexus.test.created",
      time: time.toISOString(),
      datacontenttype: "application/json",
      data: { findingId: "finding-1" },
    });
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(event.subject).toBeUndefined();

    const { data, ...attributes } = event;
    expect(eventAttributesSchema.parse(attributes)).toEqual(attributes);
    expect(data).toEqual({ findingId: "finding-1" });
  });

  it("preserves an explicit source and normalizes the subject to NFC", () => {
    const subject = "e\u0301/finding-1";

    const event = createEvent({
      source: "/services/worker",
      subject,
      type: "exposurenexus.test.updated",
      data: { changed: true },
    });

    expect(event.source).toBe("/services/worker");
    expect(event.subject).toBe("é/finding-1");
    expect(event.subject).not.toBe(subject);
  });

  it("generates UUID v4 event IDs", () => {
    const eventID = generateEventID();

    expect(eventID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("preserves literal event types and inferred data types", () => {
    const data = { findingId: "finding-1", attempt: 1 };
    const event = createEvent({
      type: "exposurenexus.test.created",
      data,
    });

    expectTypeOf(event).toEqualTypeOf<
      Event<"exposurenexus.test.created", { findingId: string; attempt: number }>
    >();
    expectTypeOf(event.type).toEqualTypeOf<"exposurenexus.test.created">();
    expectTypeOf(event.data).toEqualTypeOf<typeof data>();
    expect(event.data).toEqual(data);
  });

  it("rejects unsupported createEvent option types at compile time", () => {
    const assertRejectedTypes = () => {
      createEvent({
        type: "exposurenexus.test.created",
        // @ts-expect-error event data must be an object
        data: "not-an-object",
      });
    };

    expect(assertRejectedTypes).toBeTypeOf("function");
  });
});
