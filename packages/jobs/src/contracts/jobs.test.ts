import { describe, expect, expectTypeOf, it } from "vitest";

import { createJobEvent, ingestionJobDataSchema, jobEventSchema, JobType } from "./jobs.js";

import type { IngestionJobData, JobDataFor, JobEvent, JobEventFor } from "./jobs.js";

const ingestionData: IngestionJobData = {
  ingestionId: "550e8400-e29b-41d4-a716-446655440000",
};

const oldIngestionData = {
  userid: "550e8400-e29b-41d4-a716-446655440000",
  ingestdataurl: "https://example.com/ingest.json",
  format: "json",
};

describe("ingestion job data schema", () => {
  it("accepts only an ingestion UUID without changing it", () => {
    expect(ingestionJobDataSchema.parse(ingestionData)).toEqual(ingestionData);
  });

  it.each(["not-a-uuid", "", 42, null, undefined])(
    "rejects an invalid ingestionId (%s)",
    (value) => {
      expect(() =>
        ingestionJobDataSchema.parse({
          ingestionId: value,
        }),
      ).toThrow();
    },
  );

  it("requires ingestionId", () => {
    expect(() => ingestionJobDataSchema.parse({})).toThrow();
  });

  it("rejects the old actor, URL, and format payload", () => {
    expect(() => ingestionJobDataSchema.parse(oldIngestionData)).toThrow();
  });

  it.each([
    ["userid", oldIngestionData.userid],
    ["ingestdataurl", oldIngestionData.ingestdataurl],
    ["format", oldIngestionData.format],
    ["extra", true],
  ])("rejects the extra %s field alongside ingestionId", (field, value) => {
    expect(() =>
      ingestionJobDataSchema.parse({
        ...ingestionData,
        [field]: value,
      }),
    ).toThrow();
  });
});

describe("createJobEvent", () => {
  it("round-trips a serialized event carrying only the ingestion identity", () => {
    const event = createJobEvent({
      type: JobType.INGESTION,
      data: ingestionData,
    });

    expect(event).toMatchObject({
      specversion: "1.0",
      source: "/services/api",
      type: JobType.INGESTION,
      datacontenttype: "application/json",
      data: ingestionData,
    });
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const roundTrippedEvent = jobEventSchema.parse(JSON.parse(JSON.stringify(event)));
    expect(roundTrippedEvent).toEqual(event);
    expect(roundTrippedEvent.data).toEqual({
      ingestionId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects runtime payloads that are only structurally valid", () => {
    const dataWithExtraProperty = {
      ...ingestionData,
      extra: true,
    };

    expect(() =>
      createJobEvent({
        type: JobType.INGESTION,
        data: dataWithExtraProperty,
      }),
    ).toThrow();
  });

  it.each([
    ["invalid ingestionId", { ingestionId: "not-a-uuid" }],
    ["old payload", oldIngestionData],
  ])("rejects ingestion data at the event boundary (%s)", (_description, data) => {
    expect(() =>
      jobEventSchema.parse({
        specversion: "1.0",
        id: "550e8400-e29b-41d4-a716-446655440000",
        source: "/services/api",
        type: JobType.INGESTION,
        time: "2026-08-23T12:00:00.000Z",
        datacontenttype: "application/json",
        data,
      }),
    ).toThrow();
  });

  it.each([
    ["type", "exposurenexus.jobs.unknown"],
    ["data", undefined],
    ["extra", true],
  ])("rejects an invalid job event envelope (%s)", (field, value) => {
    const event = {
      specversion: "1.0",
      id: "550e8400-e29b-41d4-a716-446655440000",
      source: "/services/api",
      type: JobType.INGESTION,
      time: "2026-08-23T12:00:00.000Z",
      datacontenttype: "application/json",
      data: ingestionData,
    };

    if (field === "extra") {
      expect(() => jobEventSchema.parse({ ...event, extra: value })).toThrow();
      return;
    }

    expect(() => jobEventSchema.parse({ ...event, [field]: value })).toThrow();
  });

  it("keeps the job type and payload types correlated", () => {
    const event = createJobEvent({
      type: JobType.INGESTION,
      data: ingestionData,
    });

    expectTypeOf<IngestionJobData>().toEqualTypeOf<{ ingestionId: string }>();
    expectTypeOf<JobDataFor<JobType.INGESTION>>().toEqualTypeOf<IngestionJobData>();
    expectTypeOf(event).toEqualTypeOf<JobEventFor<JobType.INGESTION>>();
    expectTypeOf(event).toExtend<JobEvent>();
    expectTypeOf(event.type).toEqualTypeOf<JobType.INGESTION>();
    expectTypeOf(event.data).toEqualTypeOf<IngestionJobData>();
    expect(event.data).toEqual(ingestionData);
  });

  it("rejects unsupported job event options at compile time", () => {
    const assertRejectedTypes = () => {
      createJobEvent({
        // @ts-expect-error only known job event types can be created
        type: "exposurenexus.jobs.unknown",
        data: ingestionData,
      });

      createJobEvent({
        type: JobType.INGESTION,
        // @ts-expect-error the ingestionId field is required
        data: {},
      });

      createJobEvent({
        type: JobType.INGESTION,
        // @ts-expect-error the old payload does not identify an ingestion
        data: oldIngestionData,
      });
    };

    expect(assertRejectedTypes).toBeTypeOf("function");
  });
});
