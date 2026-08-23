import { describe, expect, expectTypeOf, it } from "vitest";

import { createJobEvent, ingestionJobDataSchema, jobEventSchema, JobType } from "./jobs.js";

import type { IngestionJobData, JobDataFor, JobEvent, JobEventFor } from "./jobs.js";

const ingestionData: IngestionJobData = {
  userid: "550e8400-e29b-41d4-a716-446655440000",
  ingestdataurl: "https://example.com/ingest.json",
  format: "json",
};

describe("ingestion job data schema", () => {
  it("accepts a valid ingestion payload without changing it", () => {
    expect(ingestionJobDataSchema.parse(ingestionData)).toEqual(ingestionData);
  });

  it.each([
    ["userid", "not-a-uuid"],
    ["userid", 42],
    ["ingestdataurl", 42],
    ["format", 42],
  ])("rejects an invalid %s value", (field, value) => {
    expect(() =>
      ingestionJobDataSchema.parse({
        ...ingestionData,
        [field]: value,
      }),
    ).toThrow();
  });

  it.each(["userid", "ingestdataurl", "format"])("requires %s", (field) => {
    const data = { ...ingestionData };
    delete data[field as keyof typeof data];

    expect(() => ingestionJobDataSchema.parse(data)).toThrow();
  });

  it("rejects payload properties outside the ingestion contract", () => {
    expect(() =>
      ingestionJobDataSchema.parse({
        ...ingestionData,
        extra: true,
      }),
    ).toThrow();
  });
});

describe("createJobEvent", () => {
  it("creates a validated ingestion event", () => {
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
    expect(jobEventSchema.parse(event)).toEqual(event);
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

  it("rejects invalid ingestion data at the event boundary", () => {
    expect(() =>
      jobEventSchema.parse({
        specversion: "1.0",
        id: "550e8400-e29b-41d4-a716-446655440000",
        source: "/services/api",
        type: JobType.INGESTION,
        time: "2026-08-23T12:00:00.000Z",
        datacontenttype: "application/json",
        data: {
          ...ingestionData,
          userid: "not-a-uuid",
        },
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
        // @ts-expect-error the format field is required
        data: {
          userid: ingestionData.userid,
          ingestdataurl: ingestionData.ingestdataurl,
        },
      });
    };

    expect(assertRejectedTypes).toBeTypeOf("function");
  });
});
