import { z } from "zod/v4";

import { dateSchema } from "./date.js";

export enum IngestionSource {
  Nuclei = "nuclei",
}

export const ingestionScopeSchema = z.record(z.string(), z.unknown());
export const ingestionCounterSchema = z.int().min(0);

export const ingestionSchema = z.strictObject({
  id: z.uuidv4(),
  source: z.enum(IngestionSource),
  scope: ingestionScopeSchema,
  createdAt: dateSchema,
  createdBy: z.uuidv4(),
  processed: ingestionCounterSchema,
  createdObservations: ingestionCounterSchema,
  skipped: ingestionCounterSchema,
  errors: ingestionCounterSchema,
});

export const createIngestionSchema = ingestionSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  processed: true,
  createdObservations: true,
  skipped: true,
  errors: true,
});

export type Ingestion = z.infer<typeof ingestionSchema>;
export type CreateIngestion = z.infer<typeof createIngestionSchema>;
