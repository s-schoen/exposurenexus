import { z } from "zod/v4";

import { eventAttributesSchema, createEvent, type EventOptions } from "./events.js";

export enum JobType {
  INGESTION = "exposurenexus.jobs.ingest",
}

export const ingestionJobDataSchema = z.strictObject({
  userid: z.uuidv4(),
  ingestdataurl: z.string(),
  format: z.string(),
});
export type IngestionJobData = z.output<typeof ingestionJobDataSchema>;

export const jobEventSchema = z.discriminatedUnion("type", [
  eventAttributesSchema.extend({
    type: z.literal(JobType.INGESTION),
    data: ingestionJobDataSchema,
  }),
]);

export type JobEvent = z.output<typeof jobEventSchema>;
export type JobEventType = JobEvent["type"];

export type JobEventFor<TType extends JobEventType> = Extract<JobEvent, { type: TType }>;
export type JobDataFor<TType extends JobEventType> = JobEventFor<TType>["data"];
export type JobEventOptions<TType extends JobEventType = JobEventType> = {
  [TSelectedType in TType]: EventOptions<TSelectedType, JobDataFor<TSelectedType>>;
}[TType];
export function createJobEvent<const TType extends JobEventType>(
  opts: JobEventOptions<TType>,
): JobEventFor<TType>;
export function createJobEvent(opts: JobEventOptions): JobEvent {
  return jobEventSchema.parse(createEvent(opts));
}
