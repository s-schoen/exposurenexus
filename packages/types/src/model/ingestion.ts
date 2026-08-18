import { z } from "zod/v4";

import { dateSchema } from "./date.js";

export enum IngestionSource {
  Nuclei = "nuclei",
}

const ingestionCounterSchema = z.int().min(0);

export const ingestionSchema = z.strictObject({
  id: z.uuidv4(),
  source: z.enum(IngestionSource),
  scope: z.record(z.string(), z.unknown()),
  createdAt: dateSchema,
  createdBy: z.uuidv4(),
  processed: ingestionCounterSchema,
  createdObservations: ingestionCounterSchema,
  skipped: ingestionCounterSchema,
  errors: ingestionCounterSchema,
});

export type Ingestion = z.infer<typeof ingestionSchema>;
