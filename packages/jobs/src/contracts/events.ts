import crypto from "node:crypto";

import { z } from "zod/v4";

// Schema according to https://github.com/cloudevents/spec/blob/v1.0.1/spec.md
export const eventAttributesSchema = z.strictObject({
  specversion: z.literal("1.0"),
  id: z.uuidv4(),
  source: z.string().regex(/^\/[a-z0-9-]+\/[a-z0-9-/]+$/),
  type: z.string(),
  time: z.iso.datetime(),
  datacontenttype: z.literal("application/json"),
  subject: z.string().optional(),
});

export type EventAttributes = z.output<typeof eventAttributesSchema>;

export type Event<
  TType extends string = string,
  TData extends object = Record<string, unknown>,
> = EventAttributes & {
  type: TType;
  data: TData;
};

export function generateEventID(): string {
  return crypto.randomUUID();
}

export enum EventSource {
  EVENT_SOURCE_API = "/services/api",
}

export interface EventOptions<TType extends string, TData extends object> {
  source?: string;
  subject?: string;
  type: TType;
  data: TData;
}

export function createEvent<const TType extends string, const TData extends object>(
  opts: EventOptions<TType, TData>,
): Event<TType, TData> {
  return {
    specversion: "1.0",
    id: generateEventID(),
    source: opts.source ?? EventSource.EVENT_SOURCE_API,
    type: opts.type,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    subject: opts.subject?.normalize("NFC"),
    data: opts.data,
  };
}
