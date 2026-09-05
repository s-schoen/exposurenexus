import { dateSchema } from "@exposurenexus/contracts/model/date";
import {
  createFindingSchema as findingInput,
  updateFindingSchema as findingUpdate,
} from "@exposurenexus/contracts/model/finding";
import { z } from "zod/v4";

import { normalizeDateToUtcStart } from "./date.js";
import { manualObservationInputSchema } from "./observation-rules.js";
import { weaknessSchema } from "./weakness-rules.js";
const dueDateSchema = dateSchema.transform(normalizeDateToUtcStart) as z.ZodType<Date, Date>;
export const createFindingSchema = findingInput.extend({
  title: z.string().trim().min(1),
  dueDate: dueDateSchema.nullable().optional().default(null),
  weakness: weaknessSchema,
  vulnerabilityIds: z
    .array(z.uuidv4())
    .default([])
    .transform((ids) => [...new Set(ids)]),
  observation: manualObservationInputSchema.optional(),
});
export const updateFindingSchema = findingUpdate.safeExtend({
  weakness: weaknessSchema.optional(),
  dueDate: dueDateSchema.nullable().optional(),
});
